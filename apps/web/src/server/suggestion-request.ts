import { z } from 'zod';

/**
 * Nút "Soạn gợi ý" (PIPE-ORCHESTRATOR lát F, Q-POR8): nhân viên YÊU CẦU AI soạn gợi ý cho một bình luận chưa có bản nháp hoặc đang "Cần nhân
 * viên". Web KHÔNG đổi trạng thái bình luận và KHÔNG chạy AI: chỉ kiểm quyền/điều kiện rồi đẩy job `pipeline` `trigger: manual` kèm người bấm;
 * worker mới đưa bình luận về trạng thái xử lý được, ghi `action_logs` (ai bấm) và chạy qua cùng cổng dừng khẩn cấp/hạn mức/trần như mọi lượt.
 * Chống bấm đúp: khóa đơn nhất theo bình luận trong cửa sổ ngắn ở hàng đợi + worker chỉ nhận bình luận còn `new`/`needs_human`.
 */
export const SUGGESTION_DEBOUNCE_SECONDS = 60;
const REQUESTABLE_STATUSES = ['new', 'needs_human'] as const;

export type SuggestionFailure = 'not_found' | 'not_eligible' | 'pipeline_off' | 'unavailable';
export type SuggestionResult = { ok: true } | { ok: false; reason: SuggestionFailure };

type Session = { workspaceId: string; userId: string };

export type SuggestionDeps = {
  /** Đọc tối thiểu qua `withActor` (RLS: chỉ thành viên đang hoạt động; workspace khác/id sai → `null`). */
  find: (
    session: Session,
    commentId: string,
  ) => Promise<{ status: string; deletedAt: Date | null } | null>;
  enqueue: (
    job: { workspaceId: string; commentId: string; trigger: 'manual'; requestedBy: string },
    options: { singletonKey: string; singletonSeconds: number },
  ) => Promise<void>;
  /** Worker pipeline có bật không (`PIPELINE_ENABLED`): tắt thì job không ai xử lý → từ chối rõ thay vì treo "đang soạn". */
  pipelineEnabled: () => boolean;
  warn: (event: { event: string; reason?: string }) => void;
};

/** Điều kiện hiển thị nút (dùng chung cho giao diện): chưa có nháp (`new`) hoặc cần nhân viên, chưa bị khách xóa. */
export function canRequestSuggestion(comment: { status: string; deletedAt: Date | null }): boolean {
  return (
    comment.deletedAt === null &&
    (REQUESTABLE_STATUSES as readonly string[]).includes(comment.status)
  );
}

const idSchema = z.uuid();

export function createSuggestionRequest(deps: SuggestionDeps) {
  return async function request(
    session: Session,
    rawCommentId: unknown,
  ): Promise<SuggestionResult> {
    const parsed = idSchema.safeParse(rawCommentId);
    if (!parsed.success) return { ok: false, reason: 'not_found' };
    if (!deps.pipelineEnabled()) return { ok: false, reason: 'pipeline_off' };
    let comment: Awaited<ReturnType<SuggestionDeps['find']>>;
    try {
      comment = await deps.find(session, parsed.data);
    } catch (error) {
      deps.warn({ event: 'suggestion_lookup_failed', reason: errorName(error) });
      return { ok: false, reason: 'unavailable' };
    }
    if (!comment) return { ok: false, reason: 'not_found' };
    if (!canRequestSuggestion(comment)) return { ok: false, reason: 'not_eligible' };
    try {
      await deps.enqueue(
        {
          workspaceId: session.workspaceId,
          commentId: parsed.data,
          trigger: 'manual',
          requestedBy: session.userId,
        },
        { singletonKey: `manual:${parsed.data}`, singletonSeconds: SUGGESTION_DEBOUNCE_SECONDS },
      );
    } catch (error) {
      deps.warn({ event: 'suggestion_enqueue_failed', reason: errorName(error) });
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true };
  };
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Truy vấn ghi kết quả pipeline (PIPE-ORCHESTRATOR lát D). Chỉ trong `withJob` của đúng workspace. Bình luận ghi qua CAS
 * `status = 'processing'` để chạy trùng không ghi hai lần (idempotent).
 */
export type CommentFinish = {
  status: 'pending_review' | 'needs_human';
  label: string | null;
  labels: ReadonlyArray<{ label: string }>;
  lang: 'vi' | 'en' | null;
  textNormalized: string;
  needsFollowup: boolean;
  followupTopics: readonly string[];
};

/** Ghi nhãn/trạng thái cuối của bình luận NẾU còn `processing`; trả `false` khi đã có job khác ghi (bỏ qua). */
export async function finishCommentProcessing(
  tx: Database,
  workspaceId: string,
  commentId: string,
  f: CommentFinish,
): Promise<boolean> {
  const r = await tx.execute<{ id: string }>(sql`
    UPDATE cf.comments SET status = ${f.status}, label = ${f.label}, label_source = 'llm',
      labels = ${JSON.stringify(f.labels)}::jsonb, lang = ${f.lang}, text_normalized = ${f.textNormalized},
      needs_followup = ${f.needsFollowup},
      followup_topics = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(f.followupTopics)}::jsonb)),
      updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid AND status = 'processing'
     RETURNING id`);
  return r.rows.length > 0;
}

/** Khóa giao dịch theo bình luận (hai job cùng ghi "Cần nhân viên" không tạo hai bản nháp). */
export async function lockCommentForPersist(tx: Database, commentId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${commentId}, 0))`);
}

export async function commentHasDraft(
  tx: Database,
  workspaceId: string,
  commentId: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    SELECT 1 FROM cf.drafts WHERE workspace_id = ${workspaceId}::uuid AND target_type = 'comment'
       AND target_id = ${commentId}::uuid LIMIT 1`);
  return r.rows.length > 0;
}

/** Bình luận đang `processing` → `needs_human` (không đụng trạng thái khác). */
export async function handoffCommentIfProcessing(
  tx: Database,
  workspaceId: string,
  commentId: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.comments SET status = 'needs_human', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid AND status = 'processing'`);
}

/** Khóa lượt `failed` kèm lý do (AI lỗi/đầu ra không đọc được). */
export async function failPipelineTurn(
  tx: Database,
  workspaceId: string,
  commentId: string,
  reason: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.pipeline_turns SET state = 'failed', last_error = ${reason.slice(0, 200)}, locked_until = NULL, updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid`);
}

/**
 * Gia hạn thuê của lượt đang xử lý thêm `seconds` giây (Q-POR6). CHỈ gia hạn khi `attempts` = lượt của CHÍNH job này (token thuê):
 * job đã mất thuê (hết hạn, job khác giành lại và tăng `attempts`) không kéo dài thuê của job khác. Trả `false` = đã mất thuê.
 */
export async function extendPipelineTurnLease(
  tx: Database,
  workspaceId: string,
  commentId: string,
  attempt: number,
  seconds: number,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.pipeline_turns SET locked_until = now() + make_interval(secs => ${seconds}), updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid AND state = 'processing' AND attempts = ${attempt}
    RETURNING comment_id`);
  return r.rows.length > 0;
}

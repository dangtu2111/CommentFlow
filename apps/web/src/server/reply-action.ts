import { z } from 'zod';
import { parseReplyText } from '../lib/reply-input';

/**
 * Logic của hành động "Gửi trả lời" (FR-042, ADR 008), tách khỏi Server Action để test với phụ thuộc được tiêm.
 * Thứ tự: kiểm đầu vào → ghi yêu cầu (hàm DB kiểm quyền/trạng thái/khóa/kênh) → đẩy job `send`; đẩy lỗi → bù hủy
 * (bình luận về trạng thái trước) để không kẹt `sending`. Log CHỈ có tên sự kiện/tên lỗi — không nội dung câu trả lời.
 */
export type ReplyFailure =
  | 'empty'
  | 'too_long'
  | 'not_found'
  | 'not_replyable'
  | 'locked_by_other'
  | 'channel_not_connected'
  | 'invalid_text'
  | 'forbidden'
  | 'queue_unavailable'
  | 'unavailable';

export type ReplyActionResult = { ok: true; replyId: string } | { ok: false; reason: ReplyFailure };

export type ReplySession = { workspaceId: string; userId: string };

export type ReplyActionDeps = {
  request: (session: ReplySession, input: { commentId: string; text: string }) => Promise<string>;
  cancel: (session: ReplySession, replyId: string) => Promise<boolean>;
  enqueue: (job: { workspaceId: string; replyId: string }) => Promise<void>;
  warn: (event: { event: string; reason?: string }) => void;
  /** Nhận ra lỗi từ chối nghiệp vụ của hàm DB (mang `reason`). */
  isRejection: (error: unknown) => error is { reason: string };
};

const REJECTIONS: readonly ReplyFailure[] = [
  'not_found',
  'not_replyable',
  'locked_by_other',
  'channel_not_connected',
  'invalid_text',
  'forbidden',
];

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

export function createReplyAction(deps: ReplyActionDeps) {
  return async function replyAction(
    session: ReplySession,
    commentId: string,
    rawText: unknown,
  ): Promise<ReplyActionResult> {
    if (!z.uuid().safeParse(commentId).success) return { ok: false, reason: 'not_found' };
    const parsed = parseReplyText(rawText);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };

    let replyId: string;
    try {
      replyId = await deps.request(session, { commentId, text: parsed.text });
    } catch (error) {
      if (deps.isRejection(error) && (REJECTIONS as readonly string[]).includes(error.reason)) {
        return { ok: false, reason: error.reason as ReplyFailure };
      }
      deps.warn({ event: 'reply_request_failed', reason: errorName(error) });
      return { ok: false, reason: 'unavailable' };
    }

    try {
      await deps.enqueue({ workspaceId: session.workspaceId, replyId });
    } catch (error) {
      deps.warn({ event: 'reply_enqueue_failed', reason: errorName(error) });
      try {
        await deps.cancel(session, replyId);
      } catch (cancelError) {
        deps.warn({ event: 'reply_cancel_failed', reason: errorName(cancelError) });
      }
      return { ok: false, reason: 'queue_unavailable' };
    }
    return { ok: true, replyId };
  };
}

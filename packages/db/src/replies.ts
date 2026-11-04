import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Lớp gọi hai hàm DEFINER của hàng đợi gửi trả lời (migration 0023, ADR 008). Quyền do DB quyết định
 * (`withActor`: thành viên đang hoạt động); mã này chỉ ánh xạ mã lỗi SQLSTATE → lý do nghiệp vụ.
 * Lưu ý: khi hàm báo lỗi, giao dịch `withActor` bị hủy — nơi gọi bắt `ReplyRejectedError` ở NGOÀI `withActor`.
 */
export const REPLY_REJECTIONS = [
  'not_found',
  'not_replyable',
  'locked_by_other',
  'channel_not_connected',
  'invalid_text',
  'forbidden',
] as const;
export type ReplyRejection = (typeof REPLY_REJECTIONS)[number];

const SQLSTATE_TO_REJECTION: Record<string, ReplyRejection> = {
  CF404: 'not_found',
  CF409: 'not_replyable',
  CF423: 'locked_by_other',
  CF424: 'channel_not_connected',
  CF422: 'invalid_text',
  '42501': 'forbidden',
};

export class ReplyRejectedError extends Error {
  readonly reason: ReplyRejection;
  constructor(reason: ReplyRejection) {
    super(`Không gửi được trả lời: ${reason}`);
    this.name = 'ReplyRejectedError';
    this.reason = reason;
  }
}

function sqlstateOf(error: unknown): string | undefined {
  const holder = error as { cause?: { code?: unknown }; code?: unknown } | null;
  const code = holder?.cause?.code ?? holder?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Ghi yêu cầu trả lời (outbox `queued`) và đặt bình luận `sending`. Trả id yêu cầu. Từ chối → `ReplyRejectedError`. */
export async function requestCommentReply(
  tx: Database,
  input: { commentId: string; text: string },
): Promise<string> {
  try {
    const result = await tx.execute<{ id: string }>(
      sql`SELECT cf.request_comment_reply(${input.commentId}::uuid, ${input.text}) AS id`,
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('cf.request_comment_reply không trả id');
    return id;
  } catch (error) {
    const reason = SQLSTATE_TO_REJECTION[sqlstateOf(error) ?? ''];
    if (reason) throw new ReplyRejectedError(reason);
    throw error;
  }
}

/** Người yêu cầu hủy yêu cầu còn `queued` (bù khi đẩy job lỗi). `false` nếu không đủ điều kiện. */
export async function cancelCommentReply(tx: Database, replyId: string): Promise<boolean> {
  const result = await tx.execute<{ ok: boolean }>(
    sql`SELECT cf.cancel_comment_reply(${replyId}::uuid) AS ok`,
  );
  return result.rows[0]?.ok === true;
}

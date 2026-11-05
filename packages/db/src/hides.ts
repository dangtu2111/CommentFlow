import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Lớp gọi hai hàm DEFINER của hàng đợi ẩn/bỏ ẩn bình luận (migration 0027, ADR 009, FR-044). Quyền do DB quyết định
 * (`withActor`: thành viên đang hoạt động); mã này chỉ ánh xạ mã lỗi SQLSTATE → lý do nghiệp vụ.
 * Lưu ý: khi hàm báo lỗi, giao dịch `withActor` bị hủy — nơi gọi bắt `HideRejectedError` ở NGOÀI `withActor`.
 */
export const HIDE_REJECTIONS = [
  'not_found',
  'not_hideable',
  'locked_by_other',
  'channel_not_connected',
  'forbidden',
] as const;
export type HideRejection = (typeof HIDE_REJECTIONS)[number];

const SQLSTATE_TO_REJECTION: Record<string, HideRejection> = {
  CF404: 'not_found',
  CF409: 'not_hideable',
  CF423: 'locked_by_other',
  CF424: 'channel_not_connected',
  '42501': 'forbidden',
};

export class HideRejectedError extends Error {
  readonly reason: HideRejection;
  constructor(reason: HideRejection) {
    super(`Không ẩn/bỏ ẩn được: ${reason}`);
    this.name = 'HideRejectedError';
    this.reason = reason;
  }
}

/** Lỗi không ánh xạ được: chỉ mang SQLSTATE (nguyên tắc #6: không để dữ liệu đi vào thông báo lỗi/log). */
export class HideRequestFailedError extends Error {
  readonly sqlstate: string | undefined;
  constructor(sqlstate: string | undefined) {
    super(`Yêu cầu ẩn/bỏ ẩn thất bại (${sqlstate ?? 'không rõ'})`);
    this.name = 'HideRequestFailedError';
    this.sqlstate = sqlstate;
  }
}

function sqlstateOf(error: unknown): string | undefined {
  const holder = error as { cause?: { code?: unknown }; code?: unknown } | null;
  const code = holder?.cause?.code ?? holder?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Ghi yêu cầu ẩn (`hide: true`) hoặc bỏ ẩn (`hide: false`) vào outbox `queued`. Trả id yêu cầu, hoặc `null` khi KHÔNG
 * có việc mới (bình luận đã ở trạng thái đích, hoặc đã có yêu cầu cùng chiều đang chạy — idempotent).
 * Từ chối → `HideRejectedError`.
 */
export async function requestCommentHide(
  tx: Database,
  input: { commentId: string; hide: boolean },
): Promise<string | null> {
  try {
    const result = await tx.execute<{ id: string | null }>(
      sql`SELECT cf.request_comment_hide(${input.commentId}::uuid, ${input.hide}::boolean) AS id`,
    );
    return result.rows[0]?.id ?? null;
  } catch (error) {
    const reason = SQLSTATE_TO_REJECTION[sqlstateOf(error) ?? ''];
    if (reason) throw new HideRejectedError(reason);
    throw new HideRequestFailedError(sqlstateOf(error));
  }
}

/** Người yêu cầu hủy yêu cầu còn `queued` (bù khi đẩy job lỗi). `false` nếu không đủ điều kiện. */
export async function cancelCommentHide(tx: Database, hideId: string): Promise<boolean> {
  const result = await tx.execute<{ ok: boolean }>(
    sql`SELECT cf.cancel_comment_hide(${hideId}::uuid) AS ok`,
  );
  return result.rows[0]?.ok === true;
}

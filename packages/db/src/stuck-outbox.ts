import { sql } from 'drizzle-orm';
import type { Database } from './client';

/** Loại yêu cầu outbox có thể kẹt: trả lời bình luận (`comment_replies`) hoặc ẩn/bỏ ẩn (`comment_hides`). */
export type StuckOutboxKind = 'reply' | 'hide';

export type StuckOutboxOptions = {
  /** `queued` không đổi quá khoảng này (giây) → coi là bị bỏ quên (đẩy job lỗi và bù hủy cũng lỗi). */
  queuedAfterSeconds: number;
  /** `sending` không đổi quá khoảng này (giây, ≥ thời hạn thuê) → worker đã chết giữa chừng. */
  sendingAfterSeconds: number;
  /** Số dòng tối đa mỗi lượt (DB giới hạn 1–500). */
  limit: number;
};

export type StuckRequest = { workspaceId: string; requestId: string };

/**
 * SEND-SWEEP / HIDE-SWEEP: liệt kê yêu cầu gửi/ẩn kẹt (migration 0031). CHỈ ĐỌC và chỉ trả id — việc xử lý lại đi qua job
 * `send`/`hide` (kiểm lại R1–R3/H1–H3). CHỈ gọi trong `db.withSystem(...)` trên kết nối `cf_worker`: hàm DEFINER từ chối
 * mọi ngữ cảnh khác (workspace, người dùng, job) và mọi role khác.
 */
export async function listStuckOutbox(
  tx: Database,
  kind: StuckOutboxKind,
  options: StuckOutboxOptions,
): Promise<StuckRequest[]> {
  const result = await tx.execute<{ workspace_id: string; request_id: string }>(sql`
    SELECT workspace_id, request_id
      FROM cf.list_stuck_outbox(${kind}::text, ${options.queuedAfterSeconds}::int,
                                ${options.sendingAfterSeconds}::int, ${options.limit}::int)`);
  return result.rows.map((row) => ({ workspaceId: row.workspace_id, requestId: row.request_id }));
}

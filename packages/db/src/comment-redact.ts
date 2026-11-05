import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Khách xóa bình luận trên nền tảng (FR-048, migration 0025): đặt `deleted_at` và XÓA TRẮNG nội dung + danh tính khách
 * (giữ dòng, trạng thái, liên kết trả lời, nhật ký); xóa luôn bản sao trong `webhook_events.payload`. CHỈ gọi trong
 * `db.withJob(...)` (đường hệ thống): hàm DEFINER từ chối mọi ngữ cảnh khác. Trả id bình luận vừa xóa; chưa có dòng hoặc đã
 * xóa từ trước → `null` (chạy lại không đổi gì).
 */
export async function markCommentDeleted(
  tx: Database,
  channelId: string,
  commentExternalId: string,
  deletedAt: Date | undefined,
): Promise<string | null> {
  const result = await tx.execute<{ id: string | null }>(
    sql`SELECT cf.mark_comment_deleted(${channelId}::uuid, ${commentExternalId}, ${deletedAt ? deletedAt.toISOString() : null}::timestamptz) AS id`,
  );
  return result.rows[0]?.id ?? null;
}

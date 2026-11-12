import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Ảnh đại diện người bình luận (migration 0089). `cf_app` không ghi được cột; hàm DEFINER chỉ cho ngữ cảnh HỆ THỐNG (worker `withJob`).
 * Chỉ điền khi bình luận của workspace hiện tại chưa xóa, không phải của Page và chưa có ảnh; URL phải là https ≤ 2048 ký tự (sai → 22023).
 * Trả `true` nếu đã ghi, `false` nếu không có dòng phù hợp.
 */
export async function setCommentAuthorAvatar(
  tx: Database,
  commentId: string,
  url: string,
): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(
    sql`SELECT cf.set_comment_author_avatar(${commentId}::uuid, ${url}) AS ok`,
  );
  return r.rows[0]?.ok === true;
}

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * POST-HYDRATE: điền nội dung bài (`message`, `permalink`, `media_url`, `created_time`) lấy từ nền tảng sau khi bài được tạo bởi webhook.
 * Chạy trong `withJob` (chỉ hệ thống ghi `posts`, RLS). CHỈ điền ô còn NULL — không ghi đè (nội dung sửa tay/đã hydrate trước đó giữ nguyên).
 * Trả `true` khi có ít nhất một ô được điền.
 */
export type PostHydration = {
  message: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  createdTime: Date | null;
};

export async function hydratePostFields(
  tx: Database,
  workspaceId: string,
  postId: string,
  info: PostHydration,
): Promise<boolean> {
  if (!info.message && !info.permalink && !info.mediaUrl && !info.createdTime) return false;
  const r = await tx.execute(sql`
    UPDATE cf.posts SET
      message = COALESCE(message, ${info.message}),
      permalink = COALESCE(permalink, ${info.permalink}),
      media_url = COALESCE(media_url, ${info.mediaUrl}),
      created_time = COALESCE(created_time, ${info.createdTime?.toISOString() ?? null}::timestamptz),
      updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${postId}::uuid
       AND (
         (message IS NULL AND ${info.message}::text IS NOT NULL)
         OR (permalink IS NULL AND ${info.permalink}::text IS NOT NULL)
         OR (media_url IS NULL AND ${info.mediaUrl}::text IS NOT NULL)
         OR (created_time IS NULL AND ${info.createdTime?.toISOString() ?? null}::timestamptz IS NOT NULL)
       )
    RETURNING id`);
  return r.rows.length > 0;
}

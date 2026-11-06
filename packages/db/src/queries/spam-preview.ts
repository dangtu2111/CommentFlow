import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Nguồn cho "Xem trước quy tắc spam" (FR-080): văn bản bình luận của workspace trong `days` ngày gần nhất, chỉ đọc.
 * Chạy trong `withActor`/`withWorkspace` (RLS) và còn lọc `workspace_id` tường minh. Bỏ dòng đã xóa/xóa trắng; giữ
 * `is_own` để tầng trên loại (nguyên tắc #5). Trần `limit` chống quét quá lớn; văn bản cắt `textMax` ký tự.
 */
export const SPAM_PREVIEW_MAX_ROWS = 2000;

export type SpamPreviewRow = { id: string; text: string; isOwn: boolean };

export async function listRecentCommentTexts(
  tx: Database,
  workspaceId: string,
  options: { days: number; limit?: number; textMax?: number },
): Promise<SpamPreviewRow[]> {
  const days = Math.max(1, Math.min(30, Math.trunc(options.days)));
  const limit = Math.max(1, Math.min(SPAM_PREVIEW_MAX_ROWS, Math.trunc(options.limit ?? 1000)));
  const textMax = Math.max(1, Math.min(2000, Math.trunc(options.textMax ?? 1000)));
  const res = await tx.execute<{ id: string; text: string; is_own: boolean }>(sql`
    SELECT id, left(text, ${textMax}) AS text, is_own
      FROM cf.comments
     WHERE workspace_id = ${workspaceId}::uuid
       AND deleted_at IS NULL
       AND redacted_at IS NULL
       AND coalesce(created_time, created_at) >= now() - make_interval(days => ${days})
     ORDER BY coalesce(created_time, created_at) DESC
     LIMIT ${limit}`);
  return res.rows.map((r) => ({ id: r.id, text: r.text, isOwn: r.is_own }));
}

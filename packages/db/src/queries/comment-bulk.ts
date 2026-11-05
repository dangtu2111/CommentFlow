import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Hành động hàng loạt trên bình luận (FR-045): Bỏ qua, Đổi nhãn. Mỗi hàm là MỘT câu UPDATE có điều kiện, chạy trong
 * `withActor(workspaceId, userId, …)`; trả về các id THỰC SỰ đổi (id workspace khác/không đủ điều kiện không xuất hiện —
 * RLS + `workspace_id = …`, nên không lộ tồn tại). Không đổi `is_hidden`/trả lời: ẩn đi đường `hides.ts`.
 * Điều kiện khớp trigger `cf.guard_comment_user_update` (0027) để cả lô không bị hủy vì một dòng vi phạm.
 */

/** Trạng thái "của người" mà người dùng được chuyển sang `skipped` (khớp trigger 0027). */
export const SKIPPABLE_STATUSES = [
  'new',
  'pending_review',
  'needs_human',
  'send_failed',
  'spam_suspected',
] as const;

const idList = (ids: readonly string[]): SQL =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/** Chuyển sang `skipped`; bỏ qua dòng đã xóa, sai trạng thái, hoặc đang bị người KHÁC khóa còn hạn. */
export async function skipComments(
  tx: Database,
  workspaceId: string,
  userId: string,
  commentIds: readonly string[],
): Promise<string[]> {
  if (commentIds.length === 0) return [];
  const statuses = sql.join(
    SKIPPABLE_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  const changed = await tx.execute<{ id: string }>(sql`
    UPDATE cf.comments
       SET status = 'skipped'
     WHERE workspace_id = ${workspaceId}::uuid
       AND id IN (${idList(commentIds)})
       AND status IN (${statuses})
       AND deleted_at IS NULL
       AND (locked_by IS NULL OR locked_until IS NULL OR locked_until <= now() OR locked_by = ${userId}::uuid)
    RETURNING id`);
  return changed.rows.map((r) => r.id);
}

/** Đổi nhãn do người chọn: `label_source = 'human'`, độ tin cậy 1, `labels` một phần tử. Bỏ qua dòng đã xóa. */
export async function relabelComments(
  tx: Database,
  workspaceId: string,
  userId: string,
  commentIds: readonly string[],
  label: string,
): Promise<string[]> {
  if (commentIds.length === 0) return [];
  const changed = await tx.execute<{ id: string }>(sql`
    UPDATE cf.comments
       SET label = ${label}::text,
           label_confidence = 1,
           label_source = 'human',
           labels = jsonb_build_array(jsonb_build_object('label', ${label}::text, 'confidence', 1))
     WHERE workspace_id = ${workspaceId}::uuid
       AND id IN (${idList(commentIds)})
       AND deleted_at IS NULL
       AND status NOT IN ('processing', 'sending')
       AND (locked_by IS NULL OR locked_until IS NULL OR locked_until <= now() OR locked_by = ${userId}::uuid)
    RETURNING id`);
  return changed.rows.map((r) => r.id);
}

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Khóa mềm bình luận (FR-041, docs/11 §5): 2 phút, gia hạn khi còn mở. Chỉ là CẢNH BÁO để đồng nghiệp không trả lời
 * trùng; chặn gửi trùng thật sự là `sendRecheck`/khóa chống trùng theo comment (FB-REPLY). Giờ lấy từ `now()` của DB.
 * Gọi trong `withActor(workspaceId, userId, …)`: trigger 0019 ép `locked_by` phải là người gọi hoặc NULL.
 */
export const COMMENT_LOCK_TTL_SECONDS = 120;

export type CommentLockResult =
  | { status: 'acquired'; until: Date }
  | { status: 'held'; holderId: string; holderName: string | null; until: Date }
  | { status: 'not_found' };

/**
 * Lấy/gia hạn khóa bằng MỘT câu UPDATE có điều kiện (nguyên tử: hai người cùng lúc → một người thắng).
 * Không tồn tại / workspace khác / người ngoài workspace (RLS) → `not_found`.
 */
export async function acquireCommentLock(
  tx: Database,
  workspaceId: string,
  commentId: string,
  userId: string,
  ttlSeconds: number = COMMENT_LOCK_TTL_SECONDS,
): Promise<CommentLockResult> {
  const acquired = await tx.execute<{ locked_until: Date }>(sql`
    UPDATE cf.comments
       SET locked_by = ${userId}::uuid,
           locked_until = now() + make_interval(secs => ${ttlSeconds})
     WHERE workspace_id = ${workspaceId}::uuid
       AND id = ${commentId}::uuid
       AND (locked_by IS NULL OR locked_until IS NULL OR locked_until <= now() OR locked_by = ${userId}::uuid)
    RETURNING locked_until`);
  const row = acquired.rows[0];
  if (row) return { status: 'acquired', until: new Date(row.locked_until) };

  const holder = await tx.execute<{
    locked_by: string | null;
    locked_until: Date;
    holder_name: string | null;
  }>(sql`
    SELECT c.locked_by, c.locked_until, u.name AS holder_name
      FROM cf.comments c
      LEFT JOIN core.users u ON u.id = c.locked_by
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.id = ${commentId}::uuid`);
  const current = holder.rows[0];
  if (!current?.locked_by) return { status: 'not_found' };
  return {
    status: 'held',
    holderId: current.locked_by,
    holderName: current.holder_name,
    until: new Date(current.locked_until),
  };
}

/** Mở khóa: chỉ người đang giữ mở được. Trả `true` nếu đã mở. */
export async function releaseCommentLock(
  tx: Database,
  workspaceId: string,
  commentId: string,
  userId: string,
): Promise<boolean> {
  const released = await tx.execute(sql`
    UPDATE cf.comments
       SET locked_by = NULL, locked_until = NULL
     WHERE workspace_id = ${workspaceId}::uuid
       AND id = ${commentId}::uuid
       AND locked_by = ${userId}::uuid
    RETURNING id`);
  return released.rows.length > 0;
}

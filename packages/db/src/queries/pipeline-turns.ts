import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Giành quyền xử lý + khóa duy nhất cho một lượt AI (PIPE-ORCHESTRATOR lát C, Q-POR3). PHẢI gọi trong `withJob` (chỉ hệ thống ghi, RLS
 * chặn workspace khác). Không tự trừ lượt: nơi gọi (worker) gọi `consume()` trong CÙNG giao dịch rồi `markPipelineTurnCharged`, để
 * "đã ghi khóa" và "đã trừ lượt" cùng sinh hoặc cùng mất.
 */
/** Thuê mặc định: dài hơn một lượt xử lý bình thường (vài lời gọi LLM), ngắn hơn thời hạn pg-boss giao lại job. */
export const DEFAULT_TURN_LEASE_SECONDS = 120;

export type BeginPipelineTurnResult =
  | { outcome: 'claimed'; attempts: number; alreadyCharged: boolean }
  /** Có job khác ĐANG xử lý bình luận này (còn thuê): bỏ qua, KHÔNG tăng lần thử, KHÔNG gọi LLM trùng. */
  | { outcome: 'busy' }
  /** Bình luận không ở trạng thái xử lý được (không tồn tại/chéo workspace/đã xử lý xong/của Page/đã xóa). */
  | { outcome: 'not_claimable' }
  /** Quá số lần thử: bình luận đã được chuyển `needs_human`, khóa `failed`. */
  | { outcome: 'attempts_exhausted' };

export async function beginPipelineTurn(
  tx: Database,
  workspaceId: string,
  commentId: string,
  options: { maxAttempts: number; leaseSeconds?: number },
): Promise<BeginPipelineTurnResult> {
  const lease = options.leaseSeconds ?? DEFAULT_TURN_LEASE_SECONDS;
  // Cập nhật CÓ ĐIỀU KIỆN giành quyền (new/processing → processing); hai job cùng bình luận được tuần tự hóa bằng khóa dòng.
  const claimed = await tx.execute<{ id: string }>(sql`
    UPDATE cf.comments SET status = 'processing', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid
       AND status IN ('new', 'processing') AND is_own = false AND deleted_at IS NULL
    RETURNING id`);
  if (claimed.rows.length === 0) return { outcome: 'not_claimable' };

  // Khóa duy nhất theo comment_id: chèn mới, hoặc (đã có) tăng số lần thử NẾU không còn job nào đang giữ thuê. Còn thuê → không có dòng
  // trả về = job khác đang xử lý (busy): không tăng `attempts`, không đổi gì.
  const turn = await tx.execute<{ attempts: number; charged_at: string | Date | null }>(sql`
    INSERT INTO cf.pipeline_turns (workspace_id, comment_id, locked_until)
    VALUES (${workspaceId}::uuid, ${commentId}::uuid, now() + make_interval(secs => ${lease}))
    ON CONFLICT (comment_id) DO UPDATE
      SET attempts = cf.pipeline_turns.attempts + 1, updated_at = now(),
          locked_until = now() + make_interval(secs => ${lease})
      WHERE cf.pipeline_turns.locked_until IS NULL OR cf.pipeline_turns.locked_until <= now()
    RETURNING attempts, charged_at`);
  const row = turn.rows[0];
  if (!row) return { outcome: 'busy' };

  if (row.attempts > options.maxAttempts) {
    // Hết lần thử: không kẹt `processing` — chuyển "Cần nhân viên" và đánh dấu khóa thất bại.
    await tx.execute(sql`
      UPDATE cf.pipeline_turns SET state = 'failed', last_error = 'attempts_exhausted', locked_until = NULL, updated_at = now()
       WHERE comment_id = ${commentId}::uuid AND workspace_id = ${workspaceId}::uuid`);
    await tx.execute(sql`
      UPDATE cf.comments SET status = 'needs_human', updated_at = now()
       WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid`);
    return { outcome: 'attempts_exhausted' };
  }
  return { outcome: 'claimed', attempts: row.attempts, alreadyCharged: row.charged_at !== null };
}

/** Ghi "đã trừ lượt" MỘT lần (trigger DB chặn sửa sau đó). Trả `true` nếu lần này vừa ghi, `false` nếu đã có từ trước. */
export async function markPipelineTurnCharged(
  tx: Database,
  workspaceId: string,
  commentId: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.pipeline_turns SET charged_at = now(), updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid AND charged_at IS NULL
    RETURNING comment_id`);
  return r.rows.length > 0;
}

/** Chặn lượt (hết hạn mức / dừng khẩn cấp…): khóa `blocked` kèm mã lý do; bình luận sang "Cần nhân viên". */
export async function blockPipelineTurn(
  tx: Database,
  workspaceId: string,
  commentId: string,
  reason: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.pipeline_turns SET state = 'blocked', last_error = ${reason.slice(0, 200)}, locked_until = NULL, updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid`);
  await tx.execute(sql`
    UPDATE cf.comments SET status = 'needs_human', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${commentId}::uuid AND status = 'processing'`);
}

/** Nhả thuê khi job lỗi có kiểm soát (để lần thử lại giành được ngay, không phải đợi thuê hết hạn). */
export async function releasePipelineTurn(
  tx: Database,
  workspaceId: string,
  commentId: string,
  lastError?: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.pipeline_turns SET locked_until = NULL, last_error = ${lastError ? lastError.slice(0, 200) : null}, updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid AND state = 'processing'`);
}

/** Xong lượt: khóa `done`. */
export async function completePipelineTurn(
  tx: Database,
  workspaceId: string,
  commentId: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.pipeline_turns SET state = 'done', locked_until = NULL, updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND comment_id = ${commentId}::uuid`);
}

/**
 * Workspace đang dừng khẩn cấp? (`workspaces.emergency_stopped_at`). KHÔNG đọc được workspace (không tồn tại/ngoài ngữ cảnh) → coi như
 * ĐANG DỪNG: đóng khi lỗi, không "mở khi lỗi".
 */
export async function isWorkspaceEmergencyStopped(
  tx: Database,
  workspaceId: string,
): Promise<boolean> {
  const r = await tx.execute<{ emergency_stopped_at: string | Date | null }>(sql`
    SELECT emergency_stopped_at FROM core.workspaces WHERE id = ${workspaceId}::uuid`);
  const row = r.rows[0];
  return row === undefined || row.emergency_stopped_at !== null;
}

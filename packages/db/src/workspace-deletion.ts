import {
  AppError,
  type DeletionRequestInfo,
  type DeletionStatus,
  parseConfirmDeletion,
} from '@flow/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { workspaceDeletionRequests } from './schema/core/workspace-deletion';

/**
 * WORKSPACE-DELETE (FR-094, migration 0055, Q-WSD1). Ba hàm của Owner chạy trong `db.withActor(workspaceId, userId, ...)`
 * (người dùng lấy từ phiên server, KHÔNG nhận từ client); hai hàm của worker chạy ở `withSystem`/`withJob` trên kết nối
 * `cf_worker`. Mọi kiểm tra quyền nằm trong hàm DB (Owner, workspace ngữ cảnh, role) — web gọi sai ngữ cảnh bị 42501.
 */

export type DeletionRequestRow = DeletionRequestInfo & {
  id: string;
  workspaceId: string;
  requestedBy: string;
  confirmedAt: Date | null;
  createdAt: Date;
};

export type ConfirmDeletionResult =
  | { result: 'ok'; executeAfter: Date }
  | { result: 'expired' | 'mismatch' | 'not_requester'; executeAfter: null };

export type DueDeletion = { workspaceId: string; requestId: string };

export type ExecuteDeletionResult = 'deleted' | 'not_due' | 'not_scheduled';

/** Bước 1: tạo (hoặc lấy lại) yêu cầu chờ xác nhận. Đã có yêu cầu `scheduled` → lỗi `CF409` (đã lên lịch xóa). */
export async function requestWorkspaceDeletion(
  tx: Database,
  workspaceId: string,
): Promise<{ requestId: string; confirmExpiresAt: Date }> {
  const result = await tx.execute<{ request_id: string; confirm_expires_at: Date }>(
    sql`SELECT request_id, confirm_expires_at FROM core.request_workspace_deletion(${workspaceId}::uuid)`,
  );
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.request_workspace_deletion không trả dòng nào');
  return { requestId: row.request_id, confirmExpiresAt: new Date(row.confirm_expires_at) };
}

/** Bước 2: gõ lại đúng mã workspace. Sai/hết hạn trả mã kết quả (không ném); request id lạ → `CF404`. */
export async function confirmWorkspaceDeletion(
  tx: Database,
  workspaceId: string,
  rawInput: unknown,
): Promise<ConfirmDeletionResult> {
  const input = parseConfirmDeletion(rawInput);
  const result = await tx.execute<{ result: string; execute_after: Date | null }>(
    sql`SELECT result, execute_after
          FROM core.confirm_workspace_deletion(${workspaceId}::uuid, ${input.requestId}::uuid, ${input.typedSlug}::text)`,
  );
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.confirm_workspace_deletion không trả dòng nào');
  if (row.result === 'ok' && row.execute_after) {
    return { result: 'ok', executeAfter: new Date(row.execute_after) };
  }
  if (row.result === 'expired' || row.result === 'mismatch' || row.result === 'not_requester') {
    return { result: row.result, executeAfter: null };
  }
  throw new AppError('INTERNAL', 'core.confirm_workspace_deletion trả mã không biết');
}

/** Hủy yêu cầu đang mở (bất kỳ Owner nào). `true` nếu có yêu cầu để hủy. */
export async function cancelWorkspaceDeletion(tx: Database, workspaceId: string): Promise<boolean> {
  const result = await tx.execute<{ cancelled: boolean }>(
    sql`SELECT core.cancel_workspace_deletion(${workspaceId}::uuid) AS cancelled`,
  );
  return result.rows[0]?.cancelled === true;
}

/** Yêu cầu gần nhất của workspace (RLS: Owner hoặc job hệ thống); chưa từng có → `null`. */
export async function getLatestDeletionRequest(
  tx: Database,
  workspaceId: string,
): Promise<DeletionRequestRow | null> {
  const [row] = await tx
    .select()
    .from(workspaceDeletionRequests)
    .where(and(eq(workspaceDeletionRequests.workspaceId, workspaceId)))
    .orderBy(desc(workspaceDeletionRequests.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    requestedBy: row.requestedBy,
    status: row.status as DeletionStatus,
    confirmExpiresAt: row.confirmExpiresAt,
    confirmedAt: row.confirmedAt,
    executeAfter: row.executeAfter,
    createdAt: row.createdAt,
  };
}

/** Worker: liệt kê yêu cầu đã tới hạn (CHỈ trong `db.withSystem(...)` trên `cf_worker`). */
export async function listDueWorkspaceDeletions(
  tx: Database,
  limit: number,
): Promise<DueDeletion[]> {
  const result = await tx.execute<{ workspace_id: string; request_id: string }>(
    sql`SELECT workspace_id, request_id FROM core.list_due_workspace_deletions(${limit}::int)`,
  );
  return result.rows.map((row) => ({ workspaceId: row.workspace_id, requestId: row.request_id }));
}

/**
 * Worker: xóa vĩnh viễn một workspace đã tới hạn (CHỈ trong `db.withJob(workspaceId, ...)` trên `cf_worker`). Hàm DB
 * kiểm lại `scheduled` + tới hạn trong chính giao dịch xóa (Owner hủy giữa chừng thì không xóa).
 */
export async function executeWorkspaceDeletion(
  tx: Database,
  workspaceId: string,
  requestId: string,
): Promise<ExecuteDeletionResult> {
  const result = await tx.execute<{ outcome: ExecuteDeletionResult }>(
    sql`SELECT core.execute_workspace_deletion(${workspaceId}::uuid, ${requestId}::uuid) AS outcome`,
  );
  const outcome = result.rows[0]?.outcome;
  if (outcome !== 'deleted' && outcome !== 'not_due' && outcome !== 'not_scheduled') {
    throw new AppError('INTERNAL', 'core.execute_workspace_deletion trả mã không biết');
  }
  return outcome;
}

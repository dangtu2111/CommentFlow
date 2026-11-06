import { AppError, parseAdminAuditInput } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Khung Admin phần DB (FR-100, FR-118, AUTH-ADMIN-SESSION, migration 0061, Q-ADSH1). Mọi hàm chạy trong
 * `withUser(adminId, ...)` (KHÔNG ngữ cảnh workspace); id phiên Admin do tầng web lấy từ phiên đã xác thực. Hàm DB DEFINER
 * tự kiểm vai trò + phiên (42501 không phải Admin/sai vai trò; CF401 phiên không hợp lệ/hết hạn) và tự lấy người thực hiện
 * + vai trò từ DB — tham số không thể giả mạo chúng.
 */
const SESSION_INVALID = 'CF401';

/** Lỗi phiên Admin (CF401) → AppError UNAUTHENTICATED để tầng web chuyển về trang đăng nhập; lỗi khác giữ nguyên. */
async function mapSessionError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if ((e?.cause?.code ?? e?.code) === SESSION_INVALID) {
      throw new AppError('UNAUTHENTICATED', 'Phiên quản trị không hợp lệ hoặc đã hết hạn.', {
        cause: error,
      });
    }
    throw error;
  }
}

export type AdminSessionStatus = { adminRole: string; expiresAt: Date };

/** Xác nhận phiên Admin còn hạn (≤ 8 giờ kể từ lúc tạo); trả vai trò Admin từ DB và hạn hiệu lực. */
export async function checkAdminSession(
  tx: Database,
  sessionId: string,
): Promise<AdminSessionStatus> {
  return mapSessionError(async () => {
    const result = await tx.execute<{ admin_role: string; expires_at: Date | string }>(
      sql`SELECT * FROM core.admin_session_status(${sessionId}::uuid)`,
    );
    const row = result.rows[0];
    if (!row) throw new AppError('UNAUTHENTICATED', 'Phiên quản trị không hợp lệ.');
    return { adminRole: row.admin_role, expiresAt: new Date(row.expires_at) };
  });
}

/** Ghi một thao tác Admin vào nhật ký chỉ-thêm. Đầu vào đã che PII/token (bất biến #6). Trả id dòng nhật ký. */
export async function recordAdminAction(
  tx: Database,
  sessionId: string,
  input: unknown,
): Promise<string> {
  const parsed = parseAdminAuditInput(input);
  return mapSessionError(async () => {
    const result = await tx.execute<{ id: string }>(sql`
      SELECT core.record_admin_action(${sessionId}::uuid, ${parsed.action}, ${parsed.targetType},
        ${parsed.targetId}, ${parsed.targetWorkspaceId}::uuid, ${JSON.stringify(parsed.detail)}::jsonb) AS id`);
    const row = result.rows[0];
    if (!row) throw new AppError('INTERNAL', 'Không ghi được nhật ký thao tác Admin.');
    return row.id;
  });
}

export type AdminAuditEntry = {
  id: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetWorkspaceId: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
};

/** Đọc nhật ký (mới nhất trước). CHỈ Super Admin (DB tự kiểm). `limit` 1..200; `before` = con trỏ (created_at, id) của dòng cuối trang trước. */
export async function listAdminAudit(
  tx: Database,
  sessionId: string,
  options: { limit: number; before?: { createdAt: Date; id: string } },
): Promise<AdminAuditEntry[]> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200) {
    throw new AppError('VALIDATION_FAILED', 'Số dòng nhật ký phải từ 1 đến 200.');
  }
  return mapSessionError(async () => {
    const result = await tx.execute<{
      id: string;
      actor_user_id: string;
      actor_role: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      target_workspace_id: string | null;
      detail: Record<string, unknown>;
      created_at: Date | string;
    }>(
      sql`SELECT * FROM core.admin_list_audit(${sessionId}::uuid, ${options.limit},
            ${options.before ? options.before.createdAt.toISOString() : null}::timestamptz,
            ${options.before ? options.before.id : null}::uuid)`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      actorRole: r.actor_role,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      targetWorkspaceId: r.target_workspace_id,
      detail: r.detail,
      createdAt: new Date(r.created_at),
    }));
  });
}

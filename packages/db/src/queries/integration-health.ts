import { AppError, sanitizeIncidentMessage } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Sức khỏe tích hợp (FR-104, migration 0059).
 *  - `recordIntegrationIncident`: worker ghi lỗi nhà cung cấp; CHỈ trong `withJob` (hệ thống, cf_worker). Thông báo
 *    luôn qua `sanitizeIncidentMessage` (bất biến #6) trước khi vào DB.
 *  - `getIntegrationErrorCounts` / `listDeadLetters`: CHỈ Super Admin, gọi trong `withUser(adminId, ...)`; hàm DB
 *    DEFINER tự kiểm vai trò (42501 nếu không phải super). Không trả payload.
 */
const INCIDENT_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

export type IncidentKind = 'webhook' | 'api' | 'token' | 'sync' | 'queue';

export type IntegrationIncidentInput = {
  provider: string;
  kind: IncidentKind;
  code: string;
  message: string;
  occurredAt?: Date;
};

export async function recordIntegrationIncident(
  tx: Database,
  workspaceId: string,
  input: IntegrationIncidentInput,
): Promise<void> {
  // `code` là mã máy (HTTP_500, TOKEN_EXPIRED…), không phải văn bản tự do: chặn rò PII/token qua cột này.
  if (!INCIDENT_CODE.test(input.code)) {
    throw new AppError('VALIDATION_FAILED', 'Mã sự cố tích hợp không hợp lệ.');
  }
  await tx.execute(sql`
    INSERT INTO cf.integration_incidents (workspace_id, provider, kind, code, message, occurred_at)
    VALUES (${workspaceId}::uuid, ${input.provider}, ${input.kind}, ${input.code},
            ${sanitizeIncidentMessage(input.message)}, ${(input.occurredAt ?? new Date()).toISOString()}::timestamptz)`);
}

export type IntegrationErrorCount = {
  provider: string;
  kind: string;
  errorCount: number;
  workspaceCount: number;
  lastOccurredAt: Date | null;
};

export async function getIntegrationErrorCounts(
  tx: Database,
  since: Date,
): Promise<IntegrationErrorCount[]> {
  const result = await tx.execute<{
    provider: string;
    kind: string;
    error_count: string;
    workspace_count: string;
    last_occurred_at: Date | string | null;
  }>(sql`SELECT * FROM cf.admin_integration_health(${since.toISOString()}::timestamptz)`);
  return result.rows.map((row) => ({
    provider: row.provider,
    kind: row.kind,
    errorCount: Number(row.error_count),
    workspaceCount: Number(row.workspace_count),
    lastOccurredAt: row.last_occurred_at === null ? null : new Date(row.last_occurred_at),
  }));
}

export type DeadLetter = {
  id: string;
  workspaceId: string | null;
  platform: string;
  attempts: number;
  /** Đã che PII ở tầng này (DB chỉ cắt độ dài). */
  error: string | null;
  createdAt: Date;
};

export async function listDeadLetters(tx: Database, limit = 50): Promise<DeadLetter[]> {
  const result = await tx.execute<{
    id: string;
    workspace_id: string | null;
    platform: string;
    attempts: number;
    error: string | null;
    created_at: Date | string;
  }>(sql`SELECT * FROM cf.admin_dead_letters(${limit}::integer)`);
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    attempts: row.attempts,
    error: row.error === null ? null : sanitizeIncidentMessage(row.error),
    createdAt: new Date(row.created_at),
  }));
}

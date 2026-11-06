import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { core, createdAt, timestamptz, updatedAt } from './common';
import { workspaces } from './tenancy';

/** Trạng thái yêu cầu xuất dữ liệu (docs/10 §3, Q-EXP1). */
export const DATA_EXPORT_STATUSES = ['pending', 'running', 'ready', 'failed', 'expired'] as const;

/**
 * Yêu cầu xuất dữ liệu workspace (FR-094, migration 0055, Q-EXP1). Owner tạo (INSERT chỉ cột workspace_id,
 * requested_by); mọi chuyển trạng thái chỉ do đường hệ thống (worker `withJob`). cf_app không DELETE.
 * Tối đa một yêu cầu đang hoạt động (pending/running) mỗi workspace. `file_key` chỉ là khóa kho, không chứa dữ liệu khách.
 */
export const dataExports = core.table(
  'data_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'),
    fileKey: text('file_key'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    rowCounts: jsonb('row_counts'),
    errorCode: text('error_code'),
    readyAt: timestamptz('ready_at'),
    expiresAt: timestamptz('expires_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('data_exports_active_unique')
      .on(t.workspaceId)
      .where(sql`${t.status} in ('pending', 'running')`),
    index('data_exports_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('data_exports_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'ready'`),
    check(
      'data_exports_status_check',
      sql`${t.status} in ('pending', 'running', 'ready', 'failed', 'expired')`,
    ),
    check(
      'data_exports_ready_check',
      sql`(${t.status} in ('ready', 'expired')) = (${t.readyAt} is not null)`,
    ),
    check('data_exports_size_check', sql`${t.sizeBytes} is null or ${t.sizeBytes} >= 0`),
  ],
);

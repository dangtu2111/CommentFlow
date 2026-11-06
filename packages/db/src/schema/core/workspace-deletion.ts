import { sql } from 'drizzle-orm';
import { check, index, integer, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { core, createdAt, timestamptz } from './common';

/**
 * Yêu cầu xóa workspace (WORKSPACE-DELETE, FR-094, migration 0055, Q-WSD1). CỐ Ý KHÔNG có khóa ngoại tới
 * `core.workspaces`: khi workspace bị xóa vĩnh viễn, dòng này còn lại làm NHẬT KÝ TỐI THIỂU (ai yêu cầu, khi nào xác
 * nhận, khi nào xóa, bao nhiêu thành viên) — không tên/slug/nội dung. `cf_app` chỉ ĐỌC (Owner của workspace); ghi duy
 * nhất qua hàm DEFINER (Owner: request/confirm/cancel; `cf_worker`: execute).
 */
export const workspaceDeletionRequests = core.table(
  'workspace_deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    requestedBy: uuid('requested_by').notNull(),
    status: text('status').notNull().default('awaiting_confirm'),
    confirmExpiresAt: timestamptz('confirm_expires_at').notNull(),
    confirmedAt: timestamptz('confirmed_at'),
    executeAfter: timestamptz('execute_after'),
    cancelledAt: timestamptz('cancelled_at'),
    cancelledBy: uuid('cancelled_by'),
    completedAt: timestamptz('completed_at'),
    deletedMembers: integer('deleted_members'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'workspace_deletion_requests_status_check',
      sql`${t.status} in ('awaiting_confirm', 'scheduled', 'cancelled', 'expired', 'completed')`,
    ),
    check(
      'workspace_deletion_requests_state_check',
      sql`(${t.status} <> 'scheduled' or (${t.confirmedAt} is not null and ${t.executeAfter} is not null))
        and (${t.status} <> 'completed' or ${t.completedAt} is not null)
        and (${t.status} <> 'cancelled' or ${t.cancelledAt} is not null)`,
    ),
    uniqueIndex('workspace_deletion_requests_open_unique')
      .on(t.workspaceId)
      .where(sql`${t.status} in ('awaiting_confirm', 'scheduled')`),
    index('workspace_deletion_requests_due_idx')
      .on(t.executeAfter)
      .where(sql`${t.status} = 'scheduled'`),
  ],
);

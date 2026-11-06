import { sql } from 'drizzle-orm';
import { check, index, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { core, timestamptz } from './common';

/**
 * Nhật ký thao tác Admin (ADMIN-SHELL, FR-100/FR-118, migration 0061, Q-ADSH1): CHỈ THÊM. Không khóa ngoại (dòng sống lâu
 * hơn người dùng/workspace/phiên). Không có `workspace_id`: workspace bị tác động nằm ở `target_workspace_id`. RLS bật
 * KHÔNG policy, mọi role ứng dụng không có quyền nào; ghi/đọc chỉ qua hàm DEFINER `core.record_admin_action` /
 * `core.admin_list_audit`; trigger chặn UPDATE/DELETE/TRUNCATE kể cả chủ bảng.
 */
export const adminAuditLog = core.table(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorRole: text('actor_role').notNull(),
    sessionId: uuid('session_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    targetWorkspaceId: uuid('target_workspace_id'),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('admin_audit_log_created_idx').on(t.createdAt.desc(), t.id.desc()),
    check('admin_audit_log_role_check', sql`${t.actorRole} in ('super', 'support', 'finance')`),
    check('admin_audit_log_action_check', sql`${t.action} ~ '^[a-z][a-z0-9_.]{2,63}$'`),
    check(
      'admin_audit_log_target_check',
      sql`(${t.targetType} is null or ${t.targetType} ~ '^[a-z][a-z0-9_]{1,39}$') and (${t.targetId} is null or ${t.targetId} ~ '^[A-Za-z0-9_.:-]{1,128}$')`,
    ),
    check(
      'admin_audit_log_detail_check',
      sql`jsonb_typeof(${t.detail}) = 'object' and octet_length(${t.detail}::text) <= 2000`,
    ),
  ],
);

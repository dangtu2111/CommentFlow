import { sql } from 'drizzle-orm';
import { boolean, check, index, numeric, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { citext, core, createdAt, timestamptz, updatedAt } from './common';

export const workspaces = core.table(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
    defaultLang: text('default_lang').notNull().default('vi'),
    // Mặc định của ai_enabled chưa có trong spec: chọn true (cần chủ dự án xác nhận).
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    emergencyStoppedAt: timestamptz('emergency_stopped_at'),
    aiCostCapUsd: numeric('ai_cost_cap_usd', { precision: 12, scale: 2 }),
    status: text('status').notNull().default('trial'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('workspaces_default_lang_check', sql`${t.defaultLang} in ('vi', 'en')`),
    check(
      'workspaces_status_check',
      sql`${t.status} in ('trial', 'active', 'past_due', 'suspended', 'deleted')`,
    ),
  ],
);

export const members = core.table(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    // active | suspended | removed (chốt 03/11). `removed` GIỮ dòng, không xóa (cf_app không có DELETE).
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('members_role_check', sql`${t.role} in ('owner', 'staff')`),
    check('members_status_check', sql`${t.status} in ('active', 'suspended', 'removed')`),
    unique('members_workspace_user_unique').on(t.workspaceId, t.userId),
    index('members_user_id_idx').on(t.userId),
  ],
);

export const invitations = core.table(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    acceptedAt: timestamptz('accepted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check('invitations_role_check', sql`${t.role} in ('owner', 'staff')`),
    index('invitations_workspace_id_idx').on(t.workspaceId),
  ],
);

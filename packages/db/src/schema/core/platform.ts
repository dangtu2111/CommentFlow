import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { core, createdAt, timestamptz, updatedAt } from './common';
import { workspaces } from './tenancy';

/** Feature flag (docs/09 §10, docs/10 §3.8). Không có workspace_id; chỉ Super Admin ghi. */
export const featureFlags = core.table(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    product: text('product').notNull(),
    description: text('description').notNull().default(''),
    kind: text('kind').notNull(),
    defaultOn: boolean('default_on').notNull().default(false),
    rolloutPercent: integer('rollout_percent').notNull().default(0),
    plans: text('plans').array(),
    owner: text('owner'),
    expiresAt: timestamptz('expires_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('feature_flags_product_check', sql`${t.product} in ('core', 'commentflow', 'excelflow')`),
    check('feature_flags_kind_check', sql`${t.kind} in ('release', 'ops', 'kill_switch', 'plan')`),
    check('feature_flags_rollout_check', sql`${t.rolloutPercent} between 0 and 100`),
    // Flag `release` bắt buộc có hạn xóa (docs/09 §10).
    check(
      'feature_flags_release_expiry_check',
      sql`${t.kind} <> 'release' or ${t.expiresAt} is not null`,
    ),
  ],
);

export const featureFlagOverrides = core.table(
  'feature_flag_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flagKey: text('flag_key')
      .notNull()
      .references(() => featureFlags.key, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull(),
    reason: text('reason'),
    setBy: uuid('set_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [unique('feature_flag_overrides_flag_workspace_unique').on(t.flagKey, t.workspaceId)],
);

/** Nhật ký hành động — chỉ thêm, không sửa/xóa (cf_app chỉ có SELECT + INSERT). */
export const actionLogs = core.table(
  'action_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    impersonationId: uuid('impersonation_id'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    check('action_logs_actor_type_check', sql`${t.actorType} in ('user', 'ai', 'system', 'admin')`),
    index('action_logs_workspace_created_idx').on(t.workspaceId, t.createdAt),
  ],
);

import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/**
 * Sự kiện webhook nhận được (idempotency + dead letter, docs/10 §3.2). `workspace_id` NULL khi chưa map được kênh:
 * dòng đó KHÔNG workspace nào thấy; ghi bằng hàm DB hẹp ở `WH-INGEST`. Payload có thể chứa tên khách → chỉ Owner/hệ thống đọc.
 */
export const webhookEvents = cf.table(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    eventHash: text('event_hash').notNull().unique(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
    processedAt: timestamptz('processed_at'),
  },
  (t) => [
    index('webhook_events_workspace_status_idx').on(t.workspaceId, t.status),
    check(
      'webhook_events_platform_check',
      sql`${t.platform} in ('facebook', 'instagram', 'tiktok')`,
    ),
    check(
      'webhook_events_status_check',
      sql`${t.status} in ('received', 'processing', 'done', 'failed', 'dead')`,
    ),
  ],
);

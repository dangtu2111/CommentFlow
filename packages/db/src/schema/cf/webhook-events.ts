import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
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
    eventHash: text('event_hash').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
    processedAt: timestamptz('processed_at'),
  },
  (t) => [
    // Một sự kiện cho MỖI workspace (một Page ở hai workspace → hai dòng); dòng chưa map (NULL) cũng chỉ một.
    unique('webhook_events_hash_workspace_unique')
      .on(t.eventHash, t.workspaceId)
      .nullsNotDistinct(),
    index('webhook_events_workspace_status_idx').on(t.workspaceId, t.status),
    // Job thử lại/xóa theo thời gian không quét cả bảng.
    index('webhook_events_pending_idx')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} in ('received', 'failed')`),
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

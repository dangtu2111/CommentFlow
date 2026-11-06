import { sql } from 'drizzle-orm';
import { check, date, integer, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { core, createdAt, timestamptz, updatedAt } from './common';
import { workspaces } from './tenancy';

/**
 * Bộ đếm hạn mức theo kỳ (docs/10 §3.6, FR-090; migration 0039): một dòng cho mỗi (workspace, sản phẩm, đồng hồ, kỳ).
 * CommentFlow dùng đồng hồ `ai_turns` (1 lượt = 1 lần AI xử lý một bình luận/tin). `cf_app` chỉ ĐỌC; ghi duy nhất qua hàm
 * DEFINER `core.consume_usage` (đường `withJob`, role `cf_worker`). Cột `limit` của docs/10 đặt tên `limit_amount`
 * (từ khóa SQL). `warned_80_at`/`blocked_at` = lần đầu chạm 80%/bị chặn trong kỳ (không xóa khi nâng hạn mức).
 */
export const usageCounters = core.table(
  'usage_counters',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    product: text('product').notNull(),
    meter: text('meter').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    used: integer('used').notNull().default(0),
    limitAmount: integer('limit_amount').notNull().default(0),
    addon: integer('addon').notNull().default(0),
    warned80At: timestamptz('warned_80_at'),
    blockedAt: timestamptz('blocked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'usage_counters_pkey',
      columns: [t.workspaceId, t.product, t.meter, t.periodStart],
    }),
    check('usage_counters_product_check', sql`${t.product} in ('commentflow', 'excelflow')`),
    check('usage_counters_meter_check', sql`${t.meter} ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check(
      'usage_counters_amounts_check',
      sql`${t.used} >= 0 and ${t.limitAmount} >= 0 and ${t.addon} >= 0`,
    ),
  ],
);

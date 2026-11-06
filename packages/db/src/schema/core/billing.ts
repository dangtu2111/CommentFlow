import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
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

/**
 * Bảng giá (FR-090, docs/10 §3.6, migration 0054, Q-PLN1): dữ liệu hệ thống, KHÔNG RLS, `cf_app` chỉ SELECT; nạp sẵn
 * bằng migration (seed duy nhất được phép ngoài từ điển viết tắt). `kind`: `trial` (dùng thử), `base` (gói tháng),
 * `addon` (mua thêm lượt: `monthly_turns` = số lượt cộng cho MỘT đơn vị). Giá chỉ để hiển thị/lập hóa đơn.
 */
export const plans = core.table(
  'plans',
  {
    product: text('product').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    priceVnd: integer('price_vnd').notNull(),
    channelsLimit: integer('channels_limit').notNull(),
    monthlyTurns: integer('monthly_turns').notNull(),
    autoReplyAllowed: boolean('auto_reply_allowed').notNull().default(false),
    trialDays: integer('trial_days'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'plans_pkey', columns: [t.product, t.code] }),
    check('plans_product_check', sql`${t.product} in ('commentflow', 'excelflow')`),
    check('plans_code_check', sql`${t.code} ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check('plans_kind_check', sql`${t.kind} in ('trial', 'base', 'addon')`),
    check(
      'plans_amounts_check',
      sql`${t.priceVnd} between 0 and 1000000000 and ${t.channelsLimit} >= 0 and ${t.monthlyTurns} between 0 and 1000000`,
    ),
    check(
      'plans_trial_days_check',
      sql`(${t.kind} = 'trial') = (${t.trialDays} is not null) and (${t.trialDays} is null or ${t.trialDays} between 1 and 90)`,
    ),
  ],
);

/**
 * Gói của workspace (FR-090, docs/10 §3.6, migration 0054): một dòng cho mỗi (workspace, sản phẩm). `cf_app` chỉ ĐỌC
 * (thành viên workspace); ghi duy nhất qua hàm DEFINER `core.start_trial` / `core.activate_plan` (chỉ `withJob` trên
 * `cf_worker`). `period_end` = hết dùng thử hoặc hết kỳ trả phí; `cancel_at` = hủy cuối kỳ (đã đặt, chưa tới).
 */
export const subscriptions = core.table(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    product: text('product').notNull(),
    planCode: text('plan_code').notNull(),
    status: text('status').notNull(),
    periodStart: timestamptz('period_start').notNull(),
    periodEnd: timestamptz('period_end').notNull(),
    cancelAt: timestamptz('cancel_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('subscriptions_workspace_product_unique').on(t.workspaceId, t.product),
    foreignKey({
      name: 'subscriptions_plan_fk',
      columns: [t.product, t.planCode],
      foreignColumns: [plans.product, plans.code],
    }),
    check('subscriptions_product_check', sql`${t.product} in ('commentflow', 'excelflow')`),
    check(
      'subscriptions_status_check',
      sql`${t.status} in ('trialing', 'active', 'past_due', 'canceled')`,
    ),
    check('subscriptions_period_check', sql`${t.periodEnd} > ${t.periodStart}`),
  ],
);

/**
 * Mã giảm giá (FR-104, ADMIN-REST, migration 0060, Q-ADP1): dữ liệu HỆ THỐNG do Super Admin quản. RLS bật, `cf_app` KHÔNG
 * có quyền nào (mã không được liệt kê cho web); đọc/ghi chỉ qua hàm DEFINER `core.admin_*` (Super Admin; Finance chỉ xem)
 * và `core.apply_coupon` (Owner của workspace). `redemption_count` tăng nguyên tử cùng dòng `coupon_redemptions`.
 */
export const coupons = core.table(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    product: text('product').notNull(),
    discountType: text('discount_type').notNull(),
    discountValue: integer('discount_value').notNull(),
    appliesPlanCodes: text('applies_plan_codes').array(),
    validFrom: timestamptz('valid_from').notNull(),
    validUntil: timestamptz('valid_until'),
    maxRedemptions: integer('max_redemptions'),
    perWorkspaceLimit: integer('per_workspace_limit').notNull().default(1),
    redemptionCount: integer('redemption_count').notNull().default(0),
    active: boolean('active').notNull().default(true),
    note: text('note').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('coupons_code_unique').on(t.code),
    check('coupons_code_check', sql`${t.code} ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'`),
    check('coupons_product_check', sql`${t.product} in ('commentflow', 'excelflow')`),
    check('coupons_type_check', sql`${t.discountType} in ('percent', 'fixed_vnd')`),
    check(
      'coupons_value_check',
      sql`${t.discountValue} between 1 and 1000000000 and (${t.discountType} <> 'percent' or ${t.discountValue} <= 100)`,
    ),
    check('coupons_window_check', sql`${t.validUntil} is null or ${t.validUntil} > ${t.validFrom}`),
    check(
      'coupons_limits_check',
      sql`(${t.maxRedemptions} is null or ${t.maxRedemptions} between 1 and 1000000) and ${t.perWorkspaceLimit} between 1 and 100 and ${t.redemptionCount} >= 0`,
    ),
    check('coupons_note_check', sql`length(${t.note}) <= 200`),
  ],
);

/**
 * Lần dùng mã (migration 0060): RLS theo workspace, thành viên được ĐỌC; KHÔNG ghi trực tiếp (chỉ `core.apply_coupon`).
 * `discount_vnd`/`plan_code` là ảnh chụp lúc áp dụng. Chưa nối thanh toán thật (gap `COUPON-CHECKOUT-WIRE`).
 */
export const couponRedemptions = core.table(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'restrict' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    product: text('product').notNull(),
    planCode: text('plan_code').notNull(),
    discountVnd: integer('discount_vnd').notNull(),
    redeemedAt: timestamptz('redeemed_at').notNull().defaultNow(),
  },
  (t) => [
    index('coupon_redemptions_coupon_idx').on(t.couponId, t.workspaceId),
    index('coupon_redemptions_workspace_idx').on(t.workspaceId, t.redeemedAt),
    check('coupon_redemptions_discount_check', sql`${t.discountVnd} >= 0`),
  ],
);

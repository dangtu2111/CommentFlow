import { z } from 'zod';
import { AppError } from './errors';
import { USAGE_MAX_AMOUNT, USAGE_PRODUCTS } from './usage';

/**
 * Gói cước và trạng thái gói hiệu lực (FR-090, US-060, docs/10 §3.6): phần THUẦN, không chạm DB. Bảng thật là
 * `core.plans`/`core.subscriptions` (migration 0054); ghi chỉ qua hàm DB của worker (xem `@flow/db` plans.ts).
 */

export const PLAN_KINDS = ['trial', 'base', 'addon'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Một gói trong bảng giá (đủ để tính hạn mức; không có giá). */
export type PlanCatalogEntry = {
  code: string;
  kind: PlanKind;
  channelsLimit: number;
  /** Lượt AI/tháng (gói add-on: số lượt cộng thêm cho một đơn vị). */
  monthlyTurns: number;
  autoReplyAllowed: boolean;
};

export type SubscriptionInfo = {
  planCode: string;
  status: SubscriptionStatus;
  periodEnd: Date;
  cancelAt: Date | null;
};

/**
 * - `none`: chưa có gói / dữ liệu không khớp (fail-closed: hạn mức 0).
 * - `trialing` / `trial_expired`: đang dùng thử / đã hết hạn dùng thử.
 * - `active` / `past_due` (chờ thanh toán, còn trong kỳ) / `expired` (hết kỳ) / `canceled`.
 */
export type PlanStateCode =
  | 'none'
  | 'trialing'
  | 'trial_expired'
  | 'active'
  | 'past_due'
  | 'expired'
  | 'canceled';

export type PlanState = {
  state: PlanStateCode;
  planCode: string | null;
  /** Hạn mức lượt AI/tháng đang có hiệu lực (0 khi không được dùng). Chưa gồm lượt mua thêm (`usage_counters.addon`). */
  turnsLimit: number;
  channelsLimit: number;
  /** Gói cho phép tự gửi. `past_due` luôn false (chờ thanh toán thì không tự gửi). */
  autoReplyAllowed: boolean;
  /** Số ngày dùng thử còn lại (làm tròn lên); `null` khi không phải dùng thử. */
  trialDaysLeft: number | null;
  periodEnd: Date | null;
  /** Đã đặt hủy vào cuối kỳ (vẫn dùng được đến `cancelAt`). */
  cancelAtPeriodEnd: boolean;
};

const DAY_MS = 24 * 3600 * 1000;

const NO_ACCESS: PlanState = {
  state: 'none',
  planCode: null,
  turnsLimit: 0,
  channelsLimit: 0,
  autoReplyAllowed: false,
  trialDaysLeft: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
};

/**
 * Gói hiệu lực của workspace tại `now`. Fail-closed: thiếu gói, gói không khớp `planCode`, hoặc `trialing` mà gói
 * không phải loại `trial` → `none` (hạn mức 0, không tự gửi). Thời điểm không hợp lệ → `AppError` (không đoán).
 */
export function resolvePlanState(
  subscription: SubscriptionInfo | null,
  plan: PlanCatalogEntry | null,
  now: Date,
): PlanState {
  if (Number.isNaN(now.getTime())) {
    throw new AppError('VALIDATION_FAILED', 'Thời điểm không hợp lệ để tính gói hiệu lực.');
  }
  if (!subscription || !plan || plan.code !== subscription.planCode) return NO_ACCESS;
  // Dữ liệu hỏng (hạn không phải ngày hợp lệ) → fail-closed, không coi là "còn hạn".
  if (Number.isNaN(subscription.periodEnd.getTime())) return NO_ACCESS;

  const base: PlanState = {
    ...NO_ACCESS,
    planCode: plan.code,
    periodEnd: subscription.periodEnd,
  };
  const grant: Pick<PlanState, 'turnsLimit' | 'channelsLimit' | 'autoReplyAllowed'> = {
    turnsLimit: plan.monthlyTurns,
    channelsLimit: plan.channelsLimit,
    autoReplyAllowed: plan.autoReplyAllowed,
  };
  const ended = subscription.periodEnd.getTime() <= now.getTime();

  switch (subscription.status) {
    case 'canceled':
      return { ...base, state: 'canceled' };
    case 'trialing': {
      if (plan.kind !== 'trial') return NO_ACCESS;
      if (ended) return { ...base, state: 'trial_expired', trialDaysLeft: 0 };
      const daysLeft = Math.ceil((subscription.periodEnd.getTime() - now.getTime()) / DAY_MS);
      return { ...base, ...grant, state: 'trialing', trialDaysLeft: daysLeft };
    }
    case 'past_due':
      if (plan.kind !== 'base') return NO_ACCESS;
      if (ended) return { ...base, state: 'expired' };
      return { ...base, ...grant, autoReplyAllowed: false, state: 'past_due' };
    case 'active': {
      if (plan.kind !== 'base') return NO_ACCESS;
      if (ended) return { ...base, state: 'expired' };
      const cancelAt = subscription.cancelAt;
      if (cancelAt && cancelAt.getTime() <= now.getTime()) return { ...base, state: 'canceled' };
      return { ...base, ...grant, state: 'active', cancelAtPeriodEnd: cancelAt !== null };
    }
  }
}

const uuid = z.string().uuid();
const product = z.enum(USAGE_PRODUCTS);

export const activatePlanInputSchema = z
  .object({
    workspaceId: uuid,
    product,
    planCode: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    periodStart: z.date(),
    periodEnd: z.date(),
  })
  .refine((v) => v.periodEnd.getTime() > v.periodStart.getTime(), {
    message: 'periodEnd phải sau periodStart',
    path: ['periodEnd'],
  });
export type ActivatePlanInput = z.infer<typeof activatePlanInputSchema>;

export const grantAddonInputSchema = z.object({
  workspaceId: uuid,
  product,
  meter: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  /** Ngày đầu kỳ `YYYY-MM-01` (xem `usagePeriodStart`). */
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/),
  addonCode: z.string().regex(/^addon_[a-z0-9_]{1,33}$/),
  quantity: z.number().int().min(1).max(USAGE_MAX_AMOUNT),
});
export type GrantAddonInput = z.infer<typeof grantAddonInputSchema>;

export function parseActivatePlan(input: unknown): ActivatePlanInput {
  const parsed = activatePlanInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu kích hoạt gói không hợp lệ.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export function parseGrantAddon(input: unknown): GrantAddonInput {
  const parsed = grantAddonInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu mua thêm lượt không hợp lệ.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

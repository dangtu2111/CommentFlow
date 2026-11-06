import { z } from 'zod';
import { AppError } from './errors';
import { USAGE_PRODUCTS } from './usage';

/**
 * Quản trị gói cước và mã giảm giá (FR-104, ADMIN-REST, Q-ADP1): phần THUẦN, không DB/mạng. Bảng thật là `core.plans`
 * (0054) và `core.coupons`/`core.coupon_redemptions` (0060). DB là nơi quyết định cuối (khóa dòng + đếm lượt nguyên tử);
 * `evaluateCoupon` dùng để xem trước/kiểm trước và phải cho cùng kết quả với hàm DB (kiểm bằng test tích hợp).
 * Không thanh toán thật: chỉ tính số tiền giảm.
 */

type AdminIdentity = { isAdmin: boolean; adminRole: string | null };

/** Chỉ Super Admin sửa gói/mã (giá là cấu hình hệ thống; Finance chỉ xem). Giá trị lạ → từ chối. */
export function canManagePlansCoupons(user: AdminIdentity): boolean {
  return user.isAdmin === true && user.adminRole === 'super';
}

/** Super Admin và Finance xem được danh sách mã (đối soát thanh toán); Support thì không. */
export function canViewCoupons(user: AdminIdentity): boolean {
  return user.isAdmin === true && (user.adminRole === 'super' || user.adminRole === 'finance');
}

export const COUPON_DISCOUNT_TYPES = ['percent', 'fixed_vnd'] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const PLAN_CODE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const COUPON_MAX_VND = 1_000_000_000;

export function normalizeCouponCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!COUPON_CODE_PATTERN.test(code)) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Mã giảm giá không hợp lệ (3–32 ký tự A–Z, 0–9, _ hoặc -).',
    );
  }
  return code;
}

const product = z.enum(USAGE_PRODUCTS);

export const couponInputSchema = z
  .object({
    code: z.string().transform((v, ctx) => {
      try {
        return normalizeCouponCode(v);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Mã giảm giá không hợp lệ.' });
        return z.NEVER;
      }
    }),
    product,
    discountType: z.enum(COUPON_DISCOUNT_TYPES),
    discountValue: z.number().int().min(1).max(COUPON_MAX_VND),
    /** null = áp cho mọi gói trả phí của sản phẩm. */
    appliesPlanCodes: z.array(z.string().regex(PLAN_CODE_PATTERN)).min(1).max(20).nullable(),
    validFrom: z.date(),
    validUntil: z.date().nullable(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
    perWorkspaceLimit: z.number().int().min(1).max(100),
    note: z.string().max(200).default(''),
  })
  .refine((v) => v.discountType !== 'percent' || v.discountValue <= 100, {
    message: 'Phần trăm giảm tối đa 100.',
    path: ['discountValue'],
  })
  .refine((v) => v.validUntil === null || v.validUntil.getTime() > v.validFrom.getTime(), {
    message: 'Hạn dùng phải sau ngày bắt đầu.',
    path: ['validUntil'],
  });
export type CouponInput = z.infer<typeof couponInputSchema>;

export function parseCouponInput(input: unknown): CouponInput {
  const parsed = couponInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu mã giảm giá không hợp lệ.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export const planUpdateSchema = z.object({
  product,
  code: z.string().regex(PLAN_CODE_PATTERN),
  name: z.string().trim().min(1).max(80),
  priceVnd: z.number().int().min(0).max(COUPON_MAX_VND),
  channelsLimit: z.number().int().min(0).max(10_000),
  monthlyTurns: z.number().int().min(0).max(1_000_000),
  autoReplyAllowed: z.boolean(),
  active: z.boolean(),
});
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export function parsePlanUpdate(input: unknown): PlanUpdateInput {
  const parsed = planUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu gói cước không hợp lệ.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Sửa mã (ngữ nghĩa "thay toàn bộ": null ở hạn/trần = bỏ hạn/bỏ trần). Mức giảm không sửa được. */
export const couponUpdateSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  validUntil: z.date().nullable(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
  note: z.string().max(200),
});
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;

export function parseCouponUpdate(input: unknown): CouponUpdateInput {
  const parsed = couponUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu sửa mã giảm giá không hợp lệ.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Trạng thái một mã tại thời điểm kiểm (khớp cột `core.coupons`). */
export type CouponRule = {
  product: string;
  discountType: CouponDiscountType;
  discountValue: number;
  appliesPlanCodes: string[] | null;
  validFrom: Date;
  validUntil: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perWorkspaceLimit: number;
  active: boolean;
};

export type CouponContext = {
  now: Date;
  plan: { product: string; code: string; kind: string; priceVnd: number };
  /** Số lần workspace này đã dùng mã. */
  workspaceRedemptions: number;
};

export type CouponRejection =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'workspace_limit_reached'
  | 'product_mismatch'
  | 'plan_not_eligible'
  | 'invalid_data';

export type CouponEvaluation =
  | { ok: true; discountVnd: number; finalPriceVnd: number }
  | { ok: false; reason: CouponRejection };

const reject = (reason: CouponRejection): CouponEvaluation => ({ ok: false, reason });
const isCount = (n: number): boolean => Number.isInteger(n) && n >= 0;

/** Kiểm hạn dùng + giới hạn lượt + gói áp dụng rồi tính số tiền giảm. Dữ liệu hỏng → từ chối (fail-closed). */
export function evaluateCoupon(rule: CouponRule, ctx: CouponContext): CouponEvaluation {
  const price = ctx.plan.priceVnd;
  if (
    !isCount(price) ||
    !isCount(ctx.workspaceRedemptions) ||
    !isCount(rule.redemptionCount) ||
    !Number.isInteger(rule.discountValue) ||
    rule.discountValue < 1 ||
    (rule.discountType === 'percent' && rule.discountValue > 100)
  ) {
    return reject('invalid_data');
  }
  if (!rule.active) return reject('inactive');
  if (price === 0) return reject('plan_not_eligible'); // gói 0 đồng: không có gì để giảm, không tiêu lượt
  const at = ctx.now.getTime();
  if (at < rule.validFrom.getTime()) return reject('not_started');
  if (rule.validUntil !== null && at >= rule.validUntil.getTime()) return reject('expired');
  if (rule.product !== ctx.plan.product) return reject('product_mismatch');
  if (
    ctx.plan.kind !== 'base' ||
    (rule.appliesPlanCodes !== null && !rule.appliesPlanCodes.includes(ctx.plan.code))
  ) {
    return reject('plan_not_eligible');
  }
  if (rule.maxRedemptions !== null && rule.redemptionCount >= rule.maxRedemptions) {
    return reject('exhausted');
  }
  if (ctx.workspaceRedemptions >= rule.perWorkspaceLimit) return reject('workspace_limit_reached');
  const raw =
    rule.discountType === 'percent'
      ? Math.floor((price * rule.discountValue) / 100)
      : rule.discountValue;
  const discountVnd = Math.min(raw, price);
  return { ok: true, discountVnd, finalPriceVnd: price - discountVnd };
}

import {
  type CouponDiscountType,
  type CouponRejection,
  parseCouponInput,
  parseCouponUpdate,
  parsePlanUpdate,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Quản trị gói cước và mã giảm giá (FR-104, migration 0060, Q-ADP1). Mọi hàm ở đây chỉ gọi hàm DEFINER của DB — DB tự kiểm
 * vai trò (42501 nếu sai) nên tầng này KHÔNG thay thế việc kiểm quyền ở route (`canManagePlansCoupons`/`canViewCoupons`).
 *  - Admin (trong `withUser(adminId, ...)`): updatePlanAsAdmin / createCoupon / updateCoupon (Super), listCoupons (Super+Finance).
 *  - Owner (trong `withActor(workspaceId, ownerId, ...)`): applyCoupon. Không thanh toán thật.
 */

export async function updatePlanAsAdmin(tx: Database, input: unknown): Promise<void> {
  const p = parsePlanUpdate(input);
  await tx.execute(sql`SELECT core.admin_update_plan(
    ${p.product}, ${p.code}, ${p.name}, ${p.priceVnd}::integer, ${p.channelsLimit}::integer,
    ${p.monthlyTurns}::integer, ${p.autoReplyAllowed}::boolean, ${p.active}::boolean)`);
}

export async function createCoupon(tx: Database, input: unknown): Promise<string> {
  const c = parseCouponInput(input);
  // Mảng truyền qua tham số JSON (không nối chuỗi); drizzle sẽ trải mảng JS thành danh sách tham số nên không dùng trực tiếp.
  const planCodes =
    c.appliesPlanCodes === null
      ? sql`NULL::text[]`
      : sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(c.appliesPlanCodes)}::jsonb))`;
  const result = await tx.execute<{ id: string }>(sql`SELECT core.admin_create_coupon(
    ${c.code}, ${c.product}, ${c.discountType}, ${c.discountValue}::integer, ${planCodes},
    ${c.validFrom.toISOString()}::timestamptz,
    ${c.validUntil === null ? null : c.validUntil.toISOString()}::timestamptz,
    ${c.maxRedemptions}::integer, ${c.perWorkspaceLimit}::integer, ${c.note}) AS id`);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('admin_create_coupon không trả id');
  return id;
}

export type CouponUpdate = {
  id: string;
  active: boolean;
  validUntil: Date | null;
  maxRedemptions: number | null;
  note: string;
};

export async function updateCoupon(tx: Database, input: CouponUpdate): Promise<void> {
  const u = parseCouponUpdate(input);
  await tx.execute(sql`SELECT core.admin_update_coupon(
    ${u.id}::uuid, ${u.active}::boolean,
    ${u.validUntil === null ? null : u.validUntil.toISOString()}::timestamptz,
    ${u.maxRedemptions}::integer, ${u.note.slice(0, 200)})`);
}

export type CouponListRow = {
  id: string;
  code: string;
  product: string;
  discountType: CouponDiscountType;
  discountValue: number;
  appliesPlanCodes: string[] | null;
  validFrom: Date;
  validUntil: Date | null;
  maxRedemptions: number | null;
  perWorkspaceLimit: number;
  redemptionCount: number;
  active: boolean;
  note: string;
  createdAt: Date;
};

export async function listCoupons(tx: Database, limit = 50): Promise<CouponListRow[]> {
  const result = await tx.execute<{
    id: string;
    code: string;
    product: string;
    discount_type: CouponDiscountType;
    discount_value: number;
    applies_plan_codes: string[] | null;
    valid_from: Date | string;
    valid_until: Date | string | null;
    max_redemptions: number | null;
    per_workspace_limit: number;
    redemption_count: number;
    active: boolean;
    note: string;
    created_at: Date | string;
  }>(sql`SELECT * FROM core.admin_list_coupons(${limit}::integer)`);
  return result.rows.map((r) => ({
    id: r.id,
    code: r.code,
    product: r.product,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    appliesPlanCodes: r.applies_plan_codes,
    validFrom: new Date(r.valid_from),
    validUntil: r.valid_until === null ? null : new Date(r.valid_until),
    maxRedemptions: r.max_redemptions,
    perWorkspaceLimit: r.per_workspace_limit,
    redemptionCount: r.redemption_count,
    active: r.active,
    note: r.note,
    createdAt: new Date(r.created_at),
  }));
}

export type ApplyCouponResult =
  | { applied: true; discountVnd: number; finalPriceVnd: number }
  | { applied: false; reason: CouponRejection | 'not_found' };

export async function applyCoupon(
  tx: Database,
  workspaceId: string,
  input: { code: string; product: string; planCode: string },
): Promise<ApplyCouponResult> {
  const result = await tx.execute<{
    r_applied: boolean;
    r_reason: string;
    r_discount_vnd: number | null;
    r_final_price_vnd: number | null;
  }>(sql`SELECT * FROM core.apply_coupon(
    ${workspaceId}::uuid, ${input.code}, ${input.product}, ${input.planCode})`);
  const row = result.rows[0];
  if (!row) throw new Error('apply_coupon không trả dòng');
  if (row.r_applied && row.r_discount_vnd !== null && row.r_final_price_vnd !== null) {
    return {
      applied: true,
      discountVnd: row.r_discount_vnd,
      finalPriceVnd: row.r_final_price_vnd,
    };
  }
  return { applied: false, reason: row.r_reason as CouponRejection | 'not_found' };
}

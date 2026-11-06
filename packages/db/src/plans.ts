import {
  AppError,
  type GrantAddonInput,
  type PlanCatalogEntry,
  type PlanKind,
  type PlanState,
  parseActivatePlan,
  parseGrantAddon,
  resolvePlanState,
  type SubscriptionInfo,
  type SubscriptionStatus,
} from '@flow/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { plans, subscriptions } from './schema/core/billing';

/** Một gói trong bảng giá, kèm tên/giá để hiển thị và lập hóa đơn. */
export type PlanRow = PlanCatalogEntry & {
  product: string;
  name: string;
  priceVnd: number;
  trialDays: number | null;
};

export type SubscriptionRow = SubscriptionInfo & {
  id: string;
  product: string;
  periodStart: Date;
};

const planColumns = {
  product: plans.product,
  code: plans.code,
  name: plans.name,
  kind: plans.kind,
  priceVnd: plans.priceVnd,
  channelsLimit: plans.channelsLimit,
  monthlyTurns: plans.monthlyTurns,
  autoReplyAllowed: plans.autoReplyAllowed,
  trialDays: plans.trialDays,
};

const asPlanRow = (row: Omit<PlanRow, 'kind'> & { kind: string }): PlanRow => ({
  ...row,
  kind: row.kind as PlanKind,
});

/** Bảng giá còn bán của một sản phẩm, rẻ nhất trước (đọc công khai với `cf_app`; không cần ngữ cảnh workspace). */
export async function listPlans(tx: Database, product: string): Promise<PlanRow[]> {
  const rows = await tx
    .select(planColumns)
    .from(plans)
    .where(and(eq(plans.product, product), eq(plans.active, true)))
    .orderBy(asc(plans.priceVnd), asc(plans.code));
  return rows.map(asPlanRow);
}

/** Gói của workspace cho một sản phẩm (RLS: thành viên workspace hoặc job hệ thống); chưa có → `null`. */
export async function getSubscription(
  tx: Database,
  workspaceId: string,
  product: string,
): Promise<SubscriptionRow | null> {
  const [row] = await tx
    .select({
      id: subscriptions.id,
      product: subscriptions.product,
      planCode: subscriptions.planCode,
      status: subscriptions.status,
      periodStart: subscriptions.periodStart,
      periodEnd: subscriptions.periodEnd,
      cancelAt: subscriptions.cancelAt,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.product, product)))
    .limit(1);
  return row ? { ...row, status: row.status as SubscriptionStatus } : null;
}

/**
 * Trạng thái gói hiệu lực của workspace tại `now` (FR-090): đọc subscription + gói rồi tính bằng `resolvePlanState`
 * (hết dùng thử/hết kỳ → hạn mức 0). Chỉ đọc; chưa có gói → `state: 'none'`.
 */
export async function getPlanState(
  tx: Database,
  workspaceId: string,
  product: string,
  now: Date,
): Promise<PlanState> {
  const subscription = await getSubscription(tx, workspaceId, product);
  if (!subscription) return resolvePlanState(null, null, now);
  const [plan] = await tx
    .select(planColumns)
    .from(plans)
    .where(and(eq(plans.product, product), eq(plans.code, subscription.planCode)))
    .limit(1);
  return resolvePlanState(subscription, plan ? asPlanRow(plan) : null, now);
}

/**
 * PLANS-SCHEMA (migration 0054): tạo dùng thử qua hàm DEFINER `core.start_trial`. CHỈ gọi trong
 * `db.withJob(workspaceId, ...)` trên `cf_worker`. Dùng thử đúng một lần: đã có gói → `'exists'` (không đổi gì).
 */
export async function startTrial(
  tx: Database,
  workspaceId: string,
  product: string,
): Promise<'ok' | 'exists'> {
  const result = await tx.execute<{ start_trial: 'ok' | 'exists' }>(
    sql`SELECT core.start_trial(${workspaceId}::uuid, ${product}::text) AS start_trial`,
  );
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.start_trial không trả dòng nào');
  return row.start_trial;
}

/**
 * Đặt gói trả phí qua `core.activate_plan` (chỉ gói `base` còn bán). CHỈ trong `withJob`. Nơi gọi chỉ được gọi sau khi
 * thanh toán đã được xác nhận đúng số tiền (`confirmInvoicePayment` trả `ok`), cùng giao dịch.
 */
export async function activatePlan(tx: Database, rawInput: unknown): Promise<void> {
  const input = parseActivatePlan(rawInput);
  await tx.execute(sql`
    SELECT core.activate_plan(${input.workspaceId}::uuid, ${input.product}::text, ${input.planCode}::text,
                              ${input.periodStart.toISOString()}::timestamptz, ${input.periodEnd.toISOString()}::timestamptz)`);
}

/**
 * Cộng lượt mua thêm vào kỳ qua `core.grant_usage_addon` (số lượt = gói add-on × `quantity`, không nhận số tự do). CHỈ
 * trong `withJob`. Mỗi lần gọi cộng MỘT lần: gọi đúng một lần cho mỗi hóa đơn đã thanh toán. Trả tổng lượt thêm của kỳ.
 */
export async function grantUsageAddon(tx: Database, rawInput: GrantAddonInput): Promise<number> {
  const input = parseGrantAddon(rawInput);
  const result = await tx.execute<{ grant_usage_addon: number }>(sql`
    SELECT core.grant_usage_addon(${input.workspaceId}::uuid, ${input.product}::text, ${input.meter}::text,
                                  ${input.periodStart}::date, ${input.addonCode}::text, ${input.quantity}::int) AS grant_usage_addon`);
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.grant_usage_addon không trả dòng nào');
  return row.grant_usage_addon;
}

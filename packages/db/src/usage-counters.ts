import { AppError } from '@flow/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { usageCounters } from './schema/core/billing';

/** Đầu vào trừ lượt; đã kiểm bằng `parseConsumeInput` (`@flow/shared`) ở nơi gọi, DB kiểm lại (22023). */
export type ConsumeUsageInput = {
  workspaceId: string;
  product: string;
  meter: string;
  amount: number;
  /** Ngày đầu kỳ `YYYY-MM-DD` (xem `usagePeriodStart`). */
  periodStart: string;
  /** Hạn mức theo gói của kỳ — nơi gọi truyền mỗi lần (nâng gói có hiệu lực ngay). */
  limit: number;
};

export type ConsumeUsageResult = {
  /** `false` = đã hết hạn mức: KHÔNG trừ, AI phải dừng (BR-06). */
  allowed: boolean;
  /** Số đã dùng SAU lần gọi này (không đổi khi bị chặn). */
  used: number;
  limit: number;
  addon: number;
  /** Lần đầu chạm 80% trong kỳ — nơi gọi báo Owner một lần. */
  warnedNow: boolean;
  /** Lần đầu bị chặn trong kỳ. */
  blockedNow: boolean;
};

/**
 * USAGE-COUNTERS (FR-090, migration 0039): trừ lượt nguyên tử qua hàm DEFINER `core.consume_usage`. CHỈ gọi trong
 * `db.withJob(workspaceId, ...)` trên kết nối `cf_worker`; hàm từ chối mọi ngữ cảnh khác và workspace khác (42501).
 * Hàm khóa dòng bộ đếm tới COMMIT: gọi trong một `withJob` NGẮN riêng, trước khi gọi LLM; bị chặn thì `return`, đừng ném
 * (rollback sẽ mất `blocked_at`). Đường web đọc bằng `withActor`, không `withWorkspace` trần.
 */
export async function consumeUsage(
  tx: Database,
  input: ConsumeUsageInput,
): Promise<ConsumeUsageResult> {
  const result = await tx.execute<{
    allowed: boolean;
    used_after: number;
    limit_now: number;
    addon_now: number;
    warned_now: boolean;
    blocked_now: boolean;
  }>(sql`
    SELECT allowed, used_after, limit_now, addon_now, warned_now, blocked_now
      FROM core.consume_usage(${input.workspaceId}::uuid, ${input.product}::text, ${input.meter}::text,
                              ${input.amount}::int, ${input.periodStart}::date, ${input.limit}::int)`);
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.consume_usage không trả dòng nào');
  return {
    allowed: row.allowed,
    used: row.used_after,
    limit: row.limit_now,
    addon: row.addon_now,
    warnedNow: row.warned_now,
    blockedNow: row.blocked_now,
  };
}

export type UsageCounterKey = {
  workspaceId: string;
  product: string;
  meter: string;
  periodStart: string;
};

export type UsageCounter = {
  used: number;
  limit: number;
  addon: number;
  warned80At: Date | null;
  blockedAt: Date | null;
};

/** Đọc bộ đếm của một kỳ (chỉ đọc, RLS: thành viên của workspace); chưa có dòng → `null` (không tự tạo). */
export async function getUsageCounter(
  tx: Database,
  key: UsageCounterKey,
): Promise<UsageCounter | null> {
  const [row] = await tx
    .select({
      used: usageCounters.used,
      limit: usageCounters.limitAmount,
      addon: usageCounters.addon,
      warned80At: usageCounters.warned80At,
      blockedAt: usageCounters.blockedAt,
    })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.workspaceId, key.workspaceId),
        eq(usageCounters.product, key.product),
        eq(usageCounters.meter, key.meter),
        eq(usageCounters.periodStart, key.periodStart),
      ),
    )
    .limit(1);
  return row ?? null;
}

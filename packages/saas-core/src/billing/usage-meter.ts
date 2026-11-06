import { consumeUsage, type FlowDb, getUsageCounter } from '@flow/db/runtime';
import { parseConsumeInput, type UsageStatus, usagePeriodStart, usageStatus } from '@flow/shared';

/**
 * Đồng hồ lượt dùng chung (FR-090, docs/09 §3.1: `meter` do sản phẩm khai báo). Ghép logic thuần của `@flow/shared`
 * (kỳ theo múi giờ, trạng thái 80%/100%) với bộ đếm DB (`core.usage_counters`, migration 0039). Không import sản phẩm.
 */

export type UsageMeterDeps = {
  /** Chỉ cần `withJob` (trừ lượt, chạy ở worker/cf_worker) và `withWorkspace` (đọc). */
  db: Pick<FlowDb, 'withJob' | 'withWorkspace'>;
  product: string;
  /** Mã đồng hồ do sản phẩm khai báo (CommentFlow: `ai_turns`). */
  meter: string;
  /** Tiêm được để test kỳ biên; mặc định đồng hồ hệ thống. */
  now?: () => Date;
};

export type ConsumeRequest = {
  /** Hạn mức theo gói của kỳ (gói cước thật: PLANS-SCHEMA). */
  limit: number;
  /** Múi giờ IANA của workspace (`workspaces.timezone`) — quyết định ranh giới tháng. */
  timeZone: string;
  /** Số lượt trừ một lần; mặc định 1 (1 lượt = 1 bình luận/tin được AI xử lý). */
  amount?: number;
};

export type ConsumeOutcome = {
  /** `false` = hết hạn mức: KHÔNG trừ, nơi gọi phải dừng AI và đề xuất mua thêm/nâng gói (BR-06). */
  allowed: boolean;
  periodStart: string;
  /** Lần đầu chạm 80% trong kỳ (báo Owner một lần). */
  warnedNow: boolean;
  /** Lần đầu bị chặn trong kỳ. */
  blockedNow: boolean;
  status: UsageStatus;
};

export type UsageMeter = {
  /** Trừ lượt nguyên tử; CHỈ gọi ở đường job hệ thống của worker (hàm DB từ chối đường khác). */
  consume(workspaceId: string, request: ConsumeRequest): Promise<ConsumeOutcome>;
  /** Đồng hồ của kỳ hiện tại, chỉ đọc (thành viên workspace); chưa có dòng → 0 lượt đã dùng. */
  read(
    workspaceId: string,
    request: Pick<ConsumeRequest, 'limit' | 'timeZone'>,
  ): Promise<UsageStatus>;
};

export function createUsageMeter(deps: UsageMeterDeps): UsageMeter {
  // Kiểm sản phẩm/đồng hồ một lần khi dựng (dùng lại schema của consume với số liệu hợp lệ).
  const { product, meter } = parseConsumeInput({
    product: deps.product,
    meter: deps.meter,
    limit: 0,
  });
  const now = deps.now ?? (() => new Date());

  const periodOf = (timeZone: string): string => usagePeriodStart(now(), timeZone);
  const checkedLimit = (limit: number): number =>
    parseConsumeInput({ product, meter, limit }).limit;

  return {
    async consume(workspaceId, request) {
      const input = parseConsumeInput({
        product,
        meter,
        amount: request.amount,
        limit: request.limit,
      });
      const periodStart = periodOf(request.timeZone);
      const result = await deps.db.withJob(workspaceId, (tx) =>
        consumeUsage(tx, { workspaceId, ...input, periodStart }),
      );
      return {
        allowed: result.allowed,
        periodStart,
        warnedNow: result.warnedNow,
        blockedNow: result.blockedNow,
        status: usageStatus({ used: result.used, limit: result.limit, addon: result.addon }),
      };
    },

    async read(workspaceId, request) {
      const limit = checkedLimit(request.limit);
      const periodStart = periodOf(request.timeZone);
      const row = await deps.db.withWorkspace(workspaceId, (tx) =>
        getUsageCounter(tx, { workspaceId, product, meter, periodStart }),
      );
      return usageStatus(row ?? { used: 0, limit });
    },
  };
}

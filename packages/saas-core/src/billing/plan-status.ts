import { type FlowDb, getPlanState, getUsageCounter } from '@flow/db/runtime';
import {
  type PlanState,
  parseConsumeInput,
  type UsageStatus,
  usagePeriodStart,
  usageStatus,
} from '@flow/shared';

/**
 * Trạng thái gói + đồng hồ lượt của workspace (FR-090, US-060, UF-9): nối gói cước (`core.subscriptions`, migration 0054)
 * với bộ đếm (`core.usage_counters`, 0039). Chỉ đọc, qua `withWorkspace` (RLS: thành viên workspace). Không import
 * sản phẩm (docs/09 §3.1: `product`/`meter` do sản phẩm khai báo).
 */

/** Trạng thái gói mà AI được phép chạy (xử lý bình luận/tin). `past_due` còn kỳ vẫn chạy nhưng không tự gửi. */
const AI_USABLE_STATES: ReadonlySet<PlanState['state']> = new Set([
  'trialing',
  'active',
  'past_due',
]);

export type PlanStatusReaderDeps = {
  db: Pick<FlowDb, 'withWorkspace'>;
  product: string;
  /** Mã đồng hồ do sản phẩm khai báo (CommentFlow: `ai_turns`). */
  meter: string;
  /** Tiêm được để test kỳ/hạn dùng thử biên; mặc định đồng hồ hệ thống. */
  now?: () => Date;
};

export type PlanStatus = {
  plan: PlanState;
  /** Đồng hồ kỳ hiện tại; hạn mức lấy từ GÓI hiệu lực (không từ số đã lưu ở bộ đếm), cộng lượt mua thêm. */
  usage: UsageStatus;
  /** AI được phép xử lý thêm: gói còn hiệu lực VÀ còn lượt. Gói hết hạn → false dù còn lượt mua thêm (fail-closed). */
  aiAllowed: boolean;
};

export type PlanStatusReader = {
  read(workspaceId: string, timeZone: string): Promise<PlanStatus>;
};

export function createPlanStatusReader(deps: PlanStatusReaderDeps): PlanStatusReader {
  // Kiểm sản phẩm/đồng hồ một lần khi dựng (dùng lại schema của consume với số liệu hợp lệ).
  const { product, meter } = parseConsumeInput({
    product: deps.product,
    meter: deps.meter,
    limit: 0,
  });
  const now = deps.now ?? (() => new Date());

  return {
    async read(workspaceId, timeZone) {
      const at = now();
      const periodStart = usagePeriodStart(at, timeZone);
      return deps.db.withWorkspace(workspaceId, async (tx) => {
        const plan = await getPlanState(tx, workspaceId, product, at);
        const counter = await getUsageCounter(tx, { workspaceId, product, meter, periodStart });
        const usage = usageStatus({
          used: counter?.used ?? 0,
          limit: plan.turnsLimit,
          addon: counter?.addon ?? 0,
        });
        return {
          plan,
          usage,
          aiAllowed: AI_USABLE_STATES.has(plan.state) && usage.level !== 'blocked',
        };
      });
    },
  };
}

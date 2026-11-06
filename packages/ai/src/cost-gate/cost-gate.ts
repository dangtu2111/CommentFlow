import { z } from 'zod';

/**
 * Cổng chi phí AI (COST-GATE, FR-071, docs/09 §6 cổng 9 + §6.1 R7): hàm THUẦN quyết định có được
 * gọi LLM cho lần này hay không, để chi phí tháng của workspace không vượt trần
 * `workspaces.ai_cost_cap_usd`. Không I/O; đầu vào do code đo (sổ chi phí + sổ đặt chỗ + ước tính).
 *
 * Tính bằng micro-đô (số nguyên) cho khớp `ai_usage.cost_usd` (6 chữ số thập phân) và tránh sai số
 * dấu phẩy động ở biên. Đóng khi không chắc: đầu vào hỏng → chặn.
 */

/** Từ mức này của trần trở đi cổng vẫn cho gọi nhưng báo `nearCap` (để cảnh báo Owner sau này). */
export const COST_NEAR_CAP_RATIO = 0.8;

const MICRO = 1_000_000;

const usd = z.number().nonnegative();

const inputSchema = z.object({
  /** Tổng chi tháng này, từ `ai_usage`. */
  spentUsd: usd,
  /** Phần đã đặt chỗ cho các lần gọi đang bay (chưa có trong `ai_usage`). */
  reservedUsd: usd,
  /** Cận trên chi phí của lần gọi này. */
  estimateUsd: usd,
  /** Trần tháng; `null` = chưa đặt trần (không chặn). */
  capUsd: usd.nullable(),
});

export type CostGateInput = z.input<typeof inputSchema>;

export type CostGateBlockReason = 'cap_reached' | 'would_exceed' | 'invalid_input';

export type CostGateDecision =
  | {
      allow: true;
      reason: 'no_cap' | 'within_cap';
      /** Còn lại sau lần gọi này; `null` khi không có trần. */
      remainingUsd: number | null;
      nearCap: boolean;
    }
  | { allow: false; reason: CostGateBlockReason };

const toMicro = (value: number): number => Math.round(value * MICRO);

export function evaluateCostGate(raw: unknown): CostGateDecision {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { allow: false, reason: 'invalid_input' };
  const { spentUsd, reservedUsd, estimateUsd, capUsd } = parsed.data;

  if (capUsd === null) return { allow: true, reason: 'no_cap', remainingUsd: null, nearCap: false };

  const cap = toMicro(capUsd);
  const used = toMicro(spentUsd) + toMicro(reservedUsd);
  if (used >= cap) return { allow: false, reason: 'cap_reached' };

  const projected = used + toMicro(estimateUsd);
  if (projected > cap) return { allow: false, reason: 'would_exceed' };

  return {
    allow: true,
    reason: 'within_cap',
    remainingUsd: (cap - projected) / MICRO,
    nearCap: projected >= Math.round(cap * COST_NEAR_CAP_RATIO),
  };
}

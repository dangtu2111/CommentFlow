import { AppError } from '@flow/shared';
import type { LlmCallInput, LlmCallResult } from '../llm-client';
import { type CostGateBlockReason, evaluateCostGate } from './cost-gate';
import { estimateCallCostUsd, type PricingTable } from './estimate';
import type { CostLedger } from './ledger';
import { createReservationBook, type ReservationBook } from './reservations';

/**
 * Bọc `createLlmClient()` bằng cổng chi phí (FR-071): đo → quyết định → đặt chỗ (tuần tự theo
 * workspace) → gọi → nhả chỗ. Bị chặn thì KHÔNG gọi LLM và ném `COST_CAP_REACHED`. Khi ghi
 * `ai_usage` xong mới nhả chỗ, nên lần đo kế tiếp thấy chi phí thật (đếm kép tạm thời, thận trọng).
 */

export type LlmCaller = { call(input: LlmCallInput): Promise<LlmCallResult> };

export type CostGatedClientOptions = {
  ledger: CostLedger;
  book?: ReservationBook;
  pricing?: PricingTable;
  now?: () => Date;
  /** Chỉ nhận siêu dữ liệu an toàn (không nội dung prompt, không số tiền của khách). */
  onBlock?: (info: { workspaceId: string; step: string; reason: CostGateBlockReason }) => void;
};

const BLOCK_MESSAGE =
  'Đã đạt hạn mức chi phí AI của tháng này; tạm dừng gọi AI. Chủ workspace có thể nâng hạn mức.';

export function createCostGatedLlmClient(
  inner: LlmCaller,
  options: CostGatedClientOptions,
): LlmCaller {
  const book = options.book ?? createReservationBook();
  const now = options.now ?? (() => new Date());

  return {
    async call(input) {
      const release = await book.withLock(input.workspaceId, async () => {
        let snapshot: Awaited<ReturnType<CostLedger['read']>>;
        try {
          snapshot = await options.ledger.read(input.workspaceId, now());
        } catch {
          // Không đo được chi phí → không gọi (đóng khi không chắc); không lộ nguyên nhân.
          throw new AppError('INTERNAL', 'Không đọc được chi phí AI; tạm không gọi AI.');
        }
        const estimateUsd = estimateCallCostUsd(
          {
            model: input.model,
            inputChars: input.messages.reduce((sum, m) => sum + m.content.length, 0),
            maxTokens: input.maxTokens,
          },
          options.pricing,
        );
        const decision = evaluateCostGate({
          spentUsd: snapshot.spentMonthUsd,
          reservedUsd: book.inFlightUsd(input.workspaceId),
          estimateUsd,
          capUsd: snapshot.capUsd,
        });
        if (!decision.allow) {
          options.onBlock?.({
            workspaceId: input.workspaceId,
            step: input.step,
            reason: decision.reason,
          });
          throw new AppError('COST_CAP_REACHED', BLOCK_MESSAGE);
        }
        return book.reserve(input.workspaceId, estimateUsd);
      });

      try {
        return await inner.call(input);
      } finally {
        release();
      }
    },
  };
}

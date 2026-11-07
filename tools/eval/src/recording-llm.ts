import type { LlmClient } from '@flow/ai';

/** Một lần gọi LLM đã ghi nhận (cùng số liệu sẽ nằm trong `ai_usage`): để báo chi phí/1.000 lượt TÁCH theo bước. */
export type UsageRecord = {
  step: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Token suy luận (đã nằm trong `outputTokens`). */
  reasoningTokens: number;
  costUsd: number;
};

/** Bọc `LlmClient`: mỗi lần gọi thành công thêm một `UsageRecord` vào `sink`. Lỗi được ném nguyên (không ghi). */
export function recordUsage(inner: LlmClient, sink: UsageRecord[]): LlmClient {
  return {
    async call(input) {
      const result = await inner.call(input);
      sink.push({
        step: input.step,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedTokens: result.cachedTokens,
        reasoningTokens: result.reasoningTokens,
        costUsd: result.costUsd,
      });
      return result;
    },
  };
}

/** `db` giả cho `createLlmClient`: không ghi DB (runner không ghi `ai_usage`; số liệu lấy từ `UsageRecord`). */
export const noopUsageDb = {
  withWorkspace: async (_workspaceId: string, fn: (tx: unknown) => unknown) =>
    fn({
      insert: () => ({ values: () => ({ returning: async () => [{ id: 'eval-no-persist' }] }) }),
    }),
};

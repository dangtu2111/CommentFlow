/**
 * Ước tính CẬN TRÊN chi phí một lần gọi LLM (FR-071) để cổng chi phí chặn trước khi gọi.
 * Cận trên (thận trọng) vì ước thấp làm cổng cho lọt; chi phí thật vẫn ghi ở `ai_usage` sau gọi.
 * Bảng giá là cấu hình tiêm vào (giá thật theo LiteLLM); model lạ → giá dự phòng cao.
 */

export type ModelPricing = {
  /** Đô la cho 1 triệu token đầu vào. */
  inputPerMTokUsd: number;
  /** Đô la cho 1 triệu token đầu ra. */
  outputPerMTokUsd: number;
};

export type PricingTable = Readonly<Record<string, ModelPricing>>;

/** Giá dự phòng thận trọng cho model chưa có trong bảng (cỡ model lớn nhất). */
export const FALLBACK_PRICING: ModelPricing = { inputPerMTokUsd: 15, outputPerMTokUsd: 75 };

/** Khi lời gọi không đặt `maxTokens`: coi như dùng hết trần này (ước thận trọng). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/** Cận trên token đầu vào: tối đa 1 token cho mỗi ký tự (tiếng Việt có dấu vẫn ≤ 1 token/ký tự). */
export function inputTokensUpperBound(chars: number): number {
  return chars;
}

export type CallEstimateInput = {
  model: string;
  /** Tổng độ dài (ký tự) của mọi tin nhắn gửi đi. */
  inputChars: number;
  maxTokens?: number;
};

/** Đầu vào hỏng → `Infinity` (cổng coi là đầu vào không hợp lệ và chặn). */
export function estimateCallCostUsd(input: CallEstimateInput, pricing: PricingTable = {}): number {
  const outputTokens = input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const valid = [input.inputChars, outputTokens].every((n) => Number.isFinite(n) && n >= 0);
  if (!valid) return Number.POSITIVE_INFINITY;
  const price = pricing[input.model] ?? FALLBACK_PRICING;
  return (
    (inputTokensUpperBound(input.inputChars) * price.inputPerMTokUsd +
      outputTokens * price.outputPerMTokUsd) /
    1_000_000
  );
}

/**
 * Bảng giá (USD / 1 triệu token) khi gọi OpenAI TRỰC TIẾP (không qua LiteLLM nên không có header chi phí).
 * Số liệu lấy từ trang model của OpenAI ngày 07/11/2026:
 *  - gpt-5-nano:   vào $0,05 · vào-cache $0,005 · ra $0,40   (model Deprecated, tắt 11/12/2026)
 *  - gpt-5.6-luna: vào $0,20 · vào-cache $0,02  · ra $1,20   (prompt > 272K token: vào ×2, ra ×1,5 — không dùng ở đây)
 * Token suy luận tính CHUNG vào token ra. Qua LiteLLM, chi phí lấy từ header `x-litellm-response-cost` (đáng tin hơn);
 * bảng này chỉ dùng cho đường gọi thẳng và để đối chiếu.
 */
export type ModelPrice = { input: number; cachedInput: number; output: number };

export const PRICES_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2 },
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

/** Tên model có thể kèm hậu tố ngày ("gpt-5-nano-2025-08-07") hoặc tiền tố nhà cung cấp ("openai/…"). */
export function priceOf(model: string): ModelPrice | null {
  const bare = model.replace(/^openai\//, '');
  const exact = PRICES_PER_MTOK[bare];
  if (exact) return exact;
  const key = Object.keys(PRICES_PER_MTOK)
    .sort((a, b) => b.length - a.length)
    .find((name) => bare.startsWith(`${name}-`));
  return key ? (PRICES_PER_MTOK[key] ?? null) : null;
}

/** Chi phí (USD) của một lần gọi; model không có trong bảng → `null` (không đoán). Input đã gồm phần cache. */
export function costFromUsage(model: string, usage: TokenUsage): number | null {
  const price = priceOf(model);
  if (!price) return null;
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  return (
    (fresh * price.input + cached * price.cachedInput + usage.outputTokens * price.output) /
    1_000_000
  );
}

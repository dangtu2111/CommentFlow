import { describe, expect, it } from 'vitest';
import { costFromUsage, PRICES_PER_MTOK, priceOf } from './pricing';

describe('EVAL-RUNNER bảng giá (trang model OpenAI, 07/11/2026)', () => {
  it('giá đúng số đã kiểm', () => {
    expect(PRICES_PER_MTOK['gpt-5-nano']).toEqual({ input: 0.05, cachedInput: 0.005, output: 0.4 });
    expect(PRICES_PER_MTOK['gpt-5.6-luna']).toEqual({ input: 0.2, cachedInput: 0.02, output: 1.2 });
  });

  it('tính chi phí: phần cache tính giá cache, token suy luận nằm trong token ra', () => {
    const luna = costFromUsage('gpt-5.6-luna', {
      inputTokens: 1_000_000,
      cachedTokens: 0,
      outputTokens: 0,
    });
    expect(luna).toBeCloseTo(0.2, 10);
    const mixed = costFromUsage('gpt-5.6-luna', {
      inputTokens: 1_000_000,
      cachedTokens: 400_000,
      outputTokens: 500_000,
    });
    expect(mixed).toBeCloseTo(0.6 * 0.2 + 0.4 * 0.02 + 0.5 * 1.2, 10);
  });

  it('cache lớn hơn input bị kẹp (không ra chi phí âm); model lạ → null, không đoán', () => {
    expect(
      costFromUsage('gpt-5-nano', { inputTokens: 10, cachedTokens: 99, outputTokens: 0 }),
    ).toBeGreaterThanOrEqual(0);
    expect(
      costFromUsage('gpt-lạ', { inputTokens: 1, cachedTokens: 0, outputTokens: 1 }),
    ).toBeNull();
  });

  it('nhận tên có tiền tố nhà cung cấp hoặc hậu tố ngày của snapshot', () => {
    expect(priceOf('openai/gpt-5-nano')).toBe(PRICES_PER_MTOK['gpt-5-nano']);
    expect(priceOf('gpt-5-nano-2025-08-07')).toBe(PRICES_PER_MTOK['gpt-5-nano']);
    expect(priceOf('gpt-5.6-luna-2026-02-16')).toBe(PRICES_PER_MTOK['gpt-5.6-luna']);
    expect(priceOf('gpt-5')).toBeNull();
  });
});

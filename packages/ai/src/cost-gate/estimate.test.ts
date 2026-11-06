import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  estimateCallCostUsd,
  FALLBACK_PRICING,
  inputTokensUpperBound,
} from './estimate';

describe('FR-071 estimateCallCostUsd — ước tính cận trên một lần gọi', () => {
  it('đếm token đầu vào theo cận trên (1 ký tự ≤ 1 token)', () => {
    expect(inputTokensUpperBound(0)).toBe(0);
    expect(inputTokensUpperBound(1000)).toBe(1000);
  });

  it('dùng bảng giá của model khi có', () => {
    const pricing = { 'm-x': { inputPerMTokUsd: 1, outputPerMTokUsd: 2 } };
    // 1.000 token vào × $1/M + 500 token ra × $2/M = 0.001 + 0.001
    expect(
      estimateCallCostUsd({ model: 'm-x', inputChars: 1000, maxTokens: 500 }, pricing),
    ).toBeCloseTo(0.002, 9);
  });

  it('model lạ → giá dự phòng thận trọng; thiếu maxTokens → trần mặc định', () => {
    const expected =
      (1000 * FALLBACK_PRICING.inputPerMTokUsd +
        DEFAULT_MAX_OUTPUT_TOKENS * FALLBACK_PRICING.outputPerMTokUsd) /
      1_000_000;
    expect(estimateCallCostUsd({ model: 'la', inputChars: 1000 })).toBeCloseTo(expected, 9);
  });

  it('đầu vào sai (âm/NaN) → ước tính ∞ (cổng sẽ chặn, đóng khi không chắc)', () => {
    expect(estimateCallCostUsd({ model: 'm', inputChars: -1 })).toBe(Number.POSITIVE_INFINITY);
    expect(estimateCallCostUsd({ model: 'm', inputChars: Number.NaN })).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(estimateCallCostUsd({ model: 'm', inputChars: 1, maxTokens: -5 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('đơn điệu theo độ dài đầu vào và maxTokens (property)', () => {
    fc.assert(
      fc.property(
        fc.nat(100_000),
        fc.nat(100_000),
        fc.integer({ min: 1, max: 32_768 }),
        fc.integer({ min: 0, max: 32_768 }),
        (a, extra, tokens, moreTokens) => {
          const low = estimateCallCostUsd({ model: 'm', inputChars: a, maxTokens: tokens });
          const high = estimateCallCostUsd({
            model: 'm',
            inputChars: a + extra,
            maxTokens: tokens + moreTokens,
          });
          expect(high).toBeGreaterThanOrEqual(low);
        },
      ),
    );
  });
});

import type { ExtractResult } from './extract-result';
import type { ExtractInput, Extractor } from './extractor';

/** Kết quả mặc định của bản mock khi không khớp fixture nào: nhãn `other`. */
export const FIXTURE_EXTRACT_DEFAULT: ExtractResult = {
  labels: [{ label: 'other', confidence: 0.5 }],
  product_mentions: [],
  refers_to_image: false,
  size: null,
  color: null,
  height_cm: null,
  weight_kg: null,
  qty: null,
  cited_price_vnd: null,
  order_intent: null,
  asks: [],
};

export type ExtractFixture = { match: RegExp; result: ExtractResult };

/**
 * Bản mock theo fixture (Xong-mock, không gọi mạng/LLM, không ghi `ai_usage`): fixture khớp đầu
 * tiên thắng. Dùng cho test và chạy thử khi chưa có khóa LLM.
 */
export function createFixtureExtractor(fixtures: readonly ExtractFixture[] = []): Extractor {
  return {
    async extract(input: ExtractInput) {
      const hit = fixtures.find((fixture) => fixture.match.test(input.text));
      return hit?.result ?? FIXTURE_EXTRACT_DEFAULT;
    },
  };
}

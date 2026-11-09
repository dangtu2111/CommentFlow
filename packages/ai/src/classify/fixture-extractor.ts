import { assertMockAllowed } from '@flow/shared';
import type { ExtractResult } from './extract-result';
import type { ExtractInput, ExtractOutcome, Extractor } from './extractor';

/** Kết quả mặc định của bản mock khi không khớp fixture nào: nhãn `other`. */
export const FIXTURE_EXTRACT_DEFAULT: ExtractOutcome = {
  labels: [{ label: 'other' }],
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
  topics: [],
  destination: null,
  // Bản MOCK: thay cho xác suất nhãn của `ml` (chưa có), không phải số model tự ghi.
  labelSignal: { ml: 0.5 },
};

export type ExtractFixture = { match: RegExp; result: ExtractResult };

/**
 * Bản mock theo fixture (Xong-mock, không gọi mạng/LLM, không ghi `ai_usage`): fixture khớp đầu
 * tiên thắng. Dùng cho test và chạy thử khi chưa có khóa LLM.
 */
export function createFixtureExtractor(fixtures: readonly ExtractFixture[] = []): Extractor {
  // Bản giả CHỈ cho test tự động/EVAL tự khai báo; tiến trình web/worker nạp → lỗi ngay (chủ dự án chốt 08/11: không mock khi chạy).
  assertMockAllowed('createFixtureExtractor');
  return {
    async extract(input: ExtractInput) {
      const hit = fixtures.find((fixture) => fixture.match.test(input.text));
      return hit?.result ?? FIXTURE_EXTRACT_DEFAULT;
    },
  };
}

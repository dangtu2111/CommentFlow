import { assertMockAllowed } from '@flow/shared';
import { type DraftResult, needsHumanResult } from './draft-result';
import type { Drafter, DraftInput } from './drafter';

/** Kết quả mặc định của bản mock khi không khớp fixture nào: chuyển nhân viên. */
export const FIXTURE_DRAFT_DEFAULT: DraftResult = needsHumanResult('Không khớp fixture');

export type DraftFixture = { match: RegExp; result: DraftResult };

/**
 * Bản mock theo fixture (Xong-mock, không gọi mạng/LLM, không ghi `ai_usage`): fixture khớp đầu tiên
 * thắng. Dùng cho test và chạy thử khi chưa có khóa LLM.
 */
export function createFixtureDrafter(fixtures: readonly DraftFixture[] = []): Drafter {
  // Bản giả CHỈ cho test tự động/EVAL tự khai báo; tiến trình web/worker nạp → lỗi ngay (chủ dự án chốt 08/11: không mock khi chạy).
  assertMockAllowed('createFixtureDrafter');
  return {
    async draft(input: DraftInput) {
      const hit = fixtures.find((fixture) => fixture.match.test(input.question));
      return hit?.result ?? FIXTURE_DRAFT_DEFAULT;
    },
  };
}

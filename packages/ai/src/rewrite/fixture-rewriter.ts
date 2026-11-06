import type { MaskedText } from '@flow/shared';
import type { RewriteInput, Rewriter } from './rewriter';
import { ruleResult } from './rewriter';

export type RewriteFixture = { match: RegExp; searchQuery: MaskedText };

/**
 * Bản mock theo fixture (Xong-mock, không gọi mạng/LLM, không ghi `ai_usage`): fixture khớp đầu tiên
 * (theo câu gốc) thắng; không khớp → câu quy tắc.
 */
export function createFixtureRewriter(fixtures: readonly RewriteFixture[] = []): Rewriter {
  return {
    async rewrite(input: RewriteInput) {
      const hit = fixtures.find((fixture) => fixture.match.test(input.comment));
      if (!hit) return ruleResult(input);
      return { original: input.comment, searchQuery: hit.searchQuery, source: 'llm' };
    },
  };
}

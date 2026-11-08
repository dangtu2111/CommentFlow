// API công khai của module rewrite. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type CustomerContext,
  MAX_OTHER_POST_QUESTIONS,
  MAX_THREAD_TURNS,
  OTHER_POST_WINDOW_DAYS,
  type OtherPostQuestion,
  type SelectContextInput,
  selectCustomerContext,
  type ThreadTurn,
} from './customer-context';
export { createFixtureRewriter, type RewriteFixture } from './fixture-rewriter';
export {
  loadRewriteConfig,
  type RewriteConfig,
} from './rewrite-config';
export {
  buildRuleQuery,
  MAX_CAPTION_CHARS,
  MAX_QUERY_CHARS,
  needsLlmRewrite,
  type RuleQueryInput,
  SHORT_COMMENT_MAX_WORDS,
} from './rewrite-query';
export {
  createLlmRewriter,
  REWRITE_PROMPT_VERSION,
  REWRITE_STEP,
  type RewriteInput,
  type RewriteResult,
  type Rewriter,
} from './rewriter';

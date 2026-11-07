// API công khai của module try. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  AUTO_SEND_BLOCK_REASONS,
  AUTO_SEND_THRESHOLD,
  type AutoSendBlockReason,
  type AutoSendPreview,
  type AutoSendPreviewInput,
  decideAutoSendPreview,
} from './auto-send-preview';
export { type BrandVoiceRow, type DraftVoicesByLang, draftVoicesFromRows } from './brand-voice';
export {
  createDbProductKnowledge,
  type DbProductKnowledge,
  missingAxesOf,
  productFactText,
} from './db-product-knowledge';
export { createDbShopKnowledgeSearch, searchShopTexts } from './db-shop-knowledge';
export { DEMO_ABBREVIATIONS } from './demo-abbreviations';
export { createDemoDrafter, createDemoExtractor, mentionsOfProducts } from './demo-ai';
export { createDemoKnowledge } from './demo-knowledge';
export { createKbTryKnowledge, type KbTryKnowledgeDeps } from './kb-try-knowledge';
export {
  type ParseTestCasesResult,
  parseTestCases,
  runTestSet,
  summarizeTestSet,
  TEST_EXPECT_ACTIONS,
  TESTSET_MAX_CASES,
  type TestCase,
  type TestCaseResult,
  type TestExpectAction,
  type TestFailure,
  type TestSetSummary,
} from './test-set';
export {
  runTryPipeline,
  TRY_MAX_CHARS,
  type TryCandidate,
  type TryDeps,
  type TryInput,
  type TryKnowledge,
  type TryResult,
} from './try-pipeline';
export {
  createTryQuota,
  DEFAULT_TRY_DAILY_LIMIT,
  type TryQuota,
  type TryQuotaResult,
} from './try-quota';

// API công khai của module try. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  AUTO_SEND_BLOCK_REASONS,
  AUTO_SEND_THRESHOLD,
  type AutoSendBlockReason,
  type AutoSendPreview,
  type AutoSendPreviewInput,
  decideAutoSendPreview,
} from './auto-send-preview';
export { createDemoDrafter, createDemoExtractor } from './demo-ai';
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

// API công khai của module classify. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type ClassifyConfig,
  DEFAULT_CLASSIFY_MODEL,
  loadClassifyConfig,
} from './classify-config';
export {
  type ExtractResult,
  extractResultSchema,
  hasLabel,
  parseExtractOutput,
  primaryLabel,
} from './extract-result';
export {
  createLlmExtractor,
  EXTRACT_PROMPT_VERSION,
  EXTRACT_STEP,
  type ExtractInput,
  type Extractor,
} from './extractor';
export {
  createFixtureExtractor,
  type ExtractFixture,
  FIXTURE_EXTRACT_DEFAULT,
} from './fixture-extractor';

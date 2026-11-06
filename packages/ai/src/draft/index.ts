// API công khai của module draft. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  DEFAULT_DRAFT_MODEL,
  type DraftConfig,
  loadDraftConfig,
} from './draft-config';
export {
  type ActionBrief,
  buildDraftMessages,
  type DraftSource,
  type DraftVoice,
  describeAddress,
} from './draft-prompt';
export {
  CLAIM_KINDS,
  type DraftLang,
  type DraftResult,
  draftResultSchema,
  enforceClaimSources,
  needsHumanResult,
  parseDraftOutput,
} from './draft-result';
export {
  createLlmDrafter,
  DEFAULT_MIN_RELEVANCE,
  DRAFT_PROMPT_VERSION,
  DRAFT_STEP,
  type Drafter,
  type DraftInput,
} from './drafter';
export {
  createFixtureDrafter,
  type DraftFixture,
  FIXTURE_DRAFT_DEFAULT,
} from './fixture-drafter';

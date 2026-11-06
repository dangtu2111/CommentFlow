// API công khai của module retrieve. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  createDbKbSearcher,
  type KbSearcher,
  type KbSearchQuery,
} from './kb-searcher';
export {
  type RetrieveDeps,
  type RetrieveInput,
  type RetrieveResult,
  retrieveKnowledge,
  type SkipReason,
} from './retrieve';
export {
  DEFAULT_MAX_SOURCE_TOKENS,
  DEFAULT_MIN_RELEVANCE_RETRIEVE,
  estimateTokens,
  type KbHit,
  kbHitsToSources,
  MAX_RRF_SCORE,
  rrfRelevance,
  variantsToSources,
} from './sources';

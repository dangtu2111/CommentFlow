// API công khai của module retrieve. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  createDbKbSearcher,
  type KbSearcher,
  type KbSearchQuery,
} from './kb-searcher';
export { shouldRerank } from './rerank-policy';
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
  KB_MIN_COSINE,
  KB_MIN_RERANK,
  type KbHit,
  kbHitsToSources,
  kbRelevanceFromCosine,
  kbRelevanceFromRerank,
  MAX_RRF_SCORE,
  rrfRelevance,
  variantsToSources,
} from './sources';

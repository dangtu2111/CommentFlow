// API công khai của module cache. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  buildExactCacheKey,
  type CachedAnswer,
  type CacheMissReason,
  createMemoryCacheStore,
  DEFAULT_CACHE_TTL_SECONDS,
  type ExactCacheDeps,
  type ExactCacheKeyInput,
  type ExactCacheLookup,
  type ExactCacheStore,
  type ExactCacheStoreResult,
  lookupExactCache,
  storeExactCache,
} from './exact-cache';
export {
  buildSemanticCacheControl,
  DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD,
  isSemanticCacheEnabled,
  SEMANTIC_CACHE_TTL_SECONDS,
  type SemanticCacheControl,
  type SemanticCacheInput,
} from './semantic-cache';

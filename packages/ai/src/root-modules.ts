// API công khai của các module nằm thẳng trong src/ (guard-money, kb-indexing, llm-client). Module mới: tạo thư mục + index.ts riêng.
export {
  checkGuardMoney,
  extractClaims,
  type GuardClaim,
  type GuardClaimKind,
  type GuardMoneyInput,
  type GuardMoneyResult,
  type GuardViolation,
} from './guard-money';
export {
  buildChunkRows,
  type ChunkRow,
  contentHash,
  createMockEmbedder,
  EMBEDDING_DIMENSIONS,
  type Embedder,
  type ExistingChunk,
  embedInBatches,
  type HashedDraft,
  type IndexingPlan,
  planChunkIndexing,
} from './kb-indexing';
export {
  createLlmClient,
  type LlmCallInput,
  type LlmCallResult,
  type LlmClient,
  type LlmClientOptions,
  type LlmMessage,
} from './llm-client';

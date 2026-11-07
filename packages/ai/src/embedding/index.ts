// API công khai của module embedding. Thêm export mới ở ĐÂY (không sửa src/index.ts).

export {
  type EmbeddingConfig,
  type EmbeddingDescription,
  resolveEmbeddingConfig,
} from './embedding-config';
export {
  type EmbeddingConsistency,
  type EmbeddingMismatch,
  type EmbeddingModelCount,
  evaluateEmbeddingConsistency,
  vectorBranchUsable,
} from './embedding-consistency';
export { createFixtureEmbedder, FIXTURE_EMBEDDING_MODEL } from './fixture-embedder';
export {
  createMlEmbedder,
  loadMlEmbedderOptions,
  ML_EMBEDDING_MODEL,
  type MlEmbedderOptions,
} from './ml-embedder';

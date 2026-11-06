/** Số chiều embedding của sản phẩm (`halfvec(1024)`, FR-139). */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Interface sinh embedding (FR-127/139). Bản fixture: `createFixtureEmbedder`. Bản gọi mô hình thật (qua LiteLLM,
 * ghi `ai_usage`) làm khi có khóa — cùng interface này, nên mã gọi không đổi.
 */
export type Embedder = {
  /** Tên model, ghi vào `kb_chunks.embedding_model`. */
  readonly model: string;
  /** Embedding theo lô, cùng thứ tự đầu vào; mỗi vector dài `EMBEDDING_DIMENSIONS`. */
  embed(texts: readonly string[]): Promise<number[][]>;
};

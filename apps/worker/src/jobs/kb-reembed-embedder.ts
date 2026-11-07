import {
  createMlEmbedder,
  createMockEmbedder,
  type Embedder,
  type MlEmbedderOptions,
} from '@flow/ai';

/**
 * Chọn embedder cho `kb-reembed` (FR-133): bge-m3 qua dịch vụ `ml` khi cấu hình bật (`ML_EMBED_ENABLED=true` + `ML_URL`,
 * xem `loadMlEmbedderOptions`), ngược lại bản mock xác định (không gọi mạng). Hàm thuần, không đọc môi trường.
 */
export function pickReembedEmbedder(config: { mlEmbedder?: MlEmbedderOptions }): Embedder {
  return config.mlEmbedder ? createMlEmbedder(config.mlEmbedder) : createMockEmbedder();
}

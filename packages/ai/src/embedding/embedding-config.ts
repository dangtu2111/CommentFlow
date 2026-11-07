import type { Embedder } from './embedder';
import { createMlEmbedder, loadMlEmbedderOptions, ML_EMBEDDING_MODEL } from './ml-embedder';

/**
 * NGUỒN DUY NHẤT của cấu hình embedding (FR-133). Web (ô Thử AI), worker (job `pipeline`, `kb-reembed`, kiểm khi khởi động) và EVAL đều gọi
 * ĐÚNG hàm này với biến môi trường của tiến trình — KHÔNG nơi nào tự chọn embedder hay đổi cờ cho riêng một lệnh.
 *
 * KHÔNG CÓ MOCK KHI CHẠY (chủ dự án chốt 08/11): thiếu cấu hình dịch vụ thật (`ML_EMBED_ENABLED=true` + `ML_URL`) → kết quả `off` (không có
 * embedder): nhánh vector bị TẮT (chỉ toàn văn/trigram) và nơi dùng báo rõ, KHÔNG âm thầm chạy vector giả. Test tự cắm embedder giả qua
 * tham số (DI), không chọn được bằng biến môi trường. Quy tắc dự án: cần đổi model/cờ thì sửa `.env.local` rồi khởi động lại, không đổi
 * riêng cho một lệnh (xem `docs/workflows/embedding-config.md`). Hàm thuần, không đọc `process.env` trực tiếp.
 */
export type EmbeddingDescription = {
  kind: 'ml' | 'off';
  /** Model đang cấu hình; `null` khi tắt. */
  model: string | null;
  /** Ghi chú cho log/báo cáo/giao diện; KHÔNG chứa URL, khóa hay token. */
  note: string;
};

export type EmbeddingConfig =
  | { kind: 'ml'; model: string; embedder: Embedder; describe: EmbeddingDescription }
  | { kind: 'off'; model: null; embedder: null; describe: EmbeddingDescription };

export function resolveEmbeddingConfig(env: Record<string, string | undefined>): EmbeddingConfig {
  const options = loadMlEmbedderOptions(env);
  if (options) {
    return {
      kind: 'ml',
      model: ML_EMBEDDING_MODEL,
      embedder: createMlEmbedder(options),
      describe: {
        kind: 'ml',
        model: ML_EMBEDDING_MODEL,
        note: 'bge-m3 qua dịch vụ ml (ML_EMBED_ENABLED=true)',
      },
    };
  }
  return {
    kind: 'off',
    model: null,
    embedder: null,
    describe: {
      kind: 'off',
      model: null,
      note: 'TẮT — chưa bật ML_EMBED_ENABLED=true hoặc thiếu ML_URL: không có nhánh vector, chỉ tìm toàn văn/trigram (không dùng vector giả)',
    },
  };
}

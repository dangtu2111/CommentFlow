import { indexText, KB_REEMBED_BATCH_MAX } from '@flow/shared';
import { type Embedder, embedInBatches } from '../kb-indexing';

/** Mặc định chặn vòng lặp vô hạn nếu có đoạn liên tục đổi nội dung giữa lúc đọc và ghi. */
const DEFAULT_MAX_BATCHES = 1000;

export type ReembedItem = {
  id: string;
  contentHash: string;
  lang: 'vi' | 'en';
  contextHeader: string | null;
  content: string;
};

/**
 * Cổng dữ liệu của job tạo lại embedding (FR-133). Bản DB (`listChunksToReembed`/`writeReembeddedChunks`) được nối ở
 * worker trong một giao dịch `withJob` của đúng workspace; test dùng bản trong bộ nhớ.
 */
export type ReembedOps = {
  /** Đoạn chưa ở mô hình `model` (khác hoặc NULL), tối đa `limit`. */
  list: (model: string, limit: number) => Promise<ReembedItem[]>;
  /** Ghi vector mới; trả số hàng đã ghi (hàng có `contentHash` lệch bị bỏ qua). */
  write: (
    model: string,
    rows: { id: string; contentHash: string; embedding: number[] }[],
  ) => Promise<number>;
};

export type ReembedResult = { reembedded: number; skipped: number; batches: number };

/**
 * Tạo lại embedding mọi đoạn của một workspace sang mô hình của `embedder` (FR-133): lấy lô → embed
 * `header + "\n" + content` (cùng văn bản lúc lập chỉ mục) → ghi. Đoạn xong rời khỏi điều kiện `list` nên chạy lại an
 * toàn (hết đoạn → 0 lô, không gọi embedder). Đoạn đổi nội dung giữa chừng được tính `skipped` và lấy lại ở lô sau.
 */
export async function reembedWorkspaceChunks(input: {
  embedder: Embedder;
  ops: ReembedOps;
  batchSize?: number;
  maxBatches?: number;
}): Promise<ReembedResult> {
  const batchSize = Math.min(input.batchSize ?? KB_REEMBED_BATCH_MAX, KB_REEMBED_BATCH_MAX);
  const maxBatches = input.maxBatches ?? DEFAULT_MAX_BATCHES;
  const { model } = input.embedder;
  const result: ReembedResult = { reembedded: 0, skipped: 0, batches: 0 };

  while (result.batches < maxBatches) {
    const batch = await input.ops.list(model, batchSize);
    if (batch.length === 0) break;
    const vectors = await embedInBatches(
      input.embedder,
      batch.map((chunk) => indexText(chunk)),
      batchSize,
    );
    const written = await input.ops.write(
      model,
      batch.map((chunk, i) => ({
        id: chunk.id,
        contentHash: chunk.contentHash,
        embedding: vectors[i] as number[],
      })),
    );
    result.reembedded += written;
    result.skipped += batch.length - written;
    result.batches += 1;
  }
  return result;
}

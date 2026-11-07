import { KB_REEMBED_BATCH_MAX } from '@flow/shared';
import { type Embedder, embedInBatches } from '../kb-indexing';
import type { ReembedResult } from './reembed';

const DEFAULT_MAX_BATCHES = 1000;

export type ReembedProductItem = { id: string; name: string };

/** Cổng dữ liệu tạo lại vector TÊN sản phẩm (FR-127/133): bản DB nối ở worker trong giao dịch `withJob`; test dùng bản bộ nhớ. */
export type ReembedProductOps = {
  /** Sản phẩm chưa ở model `model` (khác hoặc NULL), tối đa `limit`. */
  list: (model: string, limit: number) => Promise<ReembedProductItem[]>;
  /** Ghi vector + model; chỉ ghi khi tên còn như lúc đọc. Trả số hàng đã ghi. */
  write: (
    model: string,
    rows: { id: string; name: string; embedding: number[] }[],
  ) => Promise<number>;
};

export async function reembedWorkspaceProducts(input: {
  embedder: Embedder;
  ops: ReembedProductOps;
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
      batch.map((p) => p.name),
      batchSize,
    );
    const written = await input.ops.write(
      model,
      batch.map((p, i) => ({ id: p.id, name: p.name, embedding: vectors[i] as number[] })),
    );
    result.reembedded += written;
    result.skipped += batch.length - written;
    result.batches += 1;
  }
  return result;
}

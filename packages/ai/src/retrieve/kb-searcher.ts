import { type Database, searchKbChunks } from '@flow/db/runtime';
import type { KbHit } from './sources';

export type KbSearchQuery = {
  queryText: string;
  lang: 'vi' | 'en';
  /** Vector truy vấn 1024 chiều do `Embedder` tạo. */
  queryVector: readonly number[];
  /** `Embedder.model` đã tạo `queryVector`: nhánh vector chỉ so với đoạn cùng mô hình (FR-133). */
  embeddingModel?: string;
  /** Sản phẩm của bài; rỗng = không lọc theo sản phẩm. */
  productIds: readonly string[];
};

/** Cổng tìm kiến thức (hybrid vector + toàn văn + trigram). Bản DB ở dưới; test dùng bản giả. */
export type KbSearcher = (query: KbSearchQuery) => Promise<KbHit[]>;

/**
 * Bản nối DB: bọc `searchKbChunks` (đã lọc `workspace_id`, phiên bản, hiệu lực…). `tx` phải là giao dịch
 * `withWorkspace`/`withActor`/`withJob` của đúng workspace (RLS vẫn áp dụng).
 */
export function createDbKbSearcher(
  tx: Database,
  scope: { workspaceId: string; versionId: string },
): KbSearcher {
  return (query) =>
    searchKbChunks(tx, {
      workspaceId: scope.workspaceId,
      versionId: scope.versionId,
      lang: query.lang,
      queryText: query.queryText,
      queryVector: query.queryVector,
      embeddingModel: query.embeddingModel,
      productIds: query.productIds,
    });
}

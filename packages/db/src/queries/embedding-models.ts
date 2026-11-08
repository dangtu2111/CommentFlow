import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Số vector đã lưu theo MODEL tạo ra chúng — đầu vào của kiểm lệch model embedding (FR-133, `evaluateEmbeddingConsistency` ở `@flow/ai`).
 * Chỉ đoạn kiến thức ĐÃ XUẤT BẢN (không nháp) có vector; sản phẩm có `name_embedding` (model NULL → chuỗi rỗng = không rõ).
 */
export type EmbeddingModelCounts = {
  chunks: Array<{ model: string; count: number }>;
  products: Array<{ model: string; count: number }>;
};

const toCounts = (rows: Array<Record<string, unknown>>) =>
  rows.map((r) => ({ model: String(r.model ?? ''), count: Number(r.n) }));

/** Một workspace. Chạy trong `withActor`/`withWorkspace`/`withJob` của đúng workspace (RLS vẫn áp dụng). */
export async function countEmbeddingModels(
  tx: Database,
  workspaceId: string,
): Promise<EmbeddingModelCounts> {
  const chunks = await tx.execute(sql`
    SELECT coalesce(embedding_model, '') AS model, count(*)::int AS n FROM cf.kb_chunks
     WHERE workspace_id = ${workspaceId}::uuid AND NOT is_draft AND embedding IS NOT NULL
     GROUP BY 1 ORDER BY n DESC, model`);
  const products = await tx.execute(sql`
    SELECT coalesce(name_embedding_model, '') AS model, count(*)::int AS n FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND name_embedding IS NOT NULL
     GROUP BY 1 ORDER BY n DESC, model`);
  return { chunks: toCounts(chunks.rows), products: toCounts(products.rows) };
}

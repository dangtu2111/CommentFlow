/**
 * Kiểm lệch model embedding (FR-133). Hàm THUẦN: nhận model đang cấu hình + số vector đã lưu theo model, trả trạng thái.
 * Lệch → nơi dùng TẮT nhánh vector (chỉ toàn văn/trigram) và báo rõ cho tới khi `kb:reembed` xong; KHÔNG bao giờ trộn vector khác model.
 */
export type EmbeddingModelCount = { model: string; count: number };

export type EmbeddingMismatch = { source: 'kb_chunks' | 'products'; model: string; count: number };

export type EmbeddingConsistency =
  | { state: 'off'; configuredModel: null; mismatches: [] }
  | { state: 'empty' | 'ok'; configuredModel: string; mismatches: [] }
  | { state: 'mismatch'; configuredModel: string; mismatches: EmbeddingMismatch[] };

export function evaluateEmbeddingConsistency(input: {
  configuredModel: string | null;
  /** Đoạn kiến thức ĐÃ XUẤT BẢN có vector, theo `embedding_model`. */
  chunks: readonly EmbeddingModelCount[];
  /** Sản phẩm có `name_embedding`, theo `name_embedding_model` (NULL → chuỗi rỗng = không rõ model). */
  products: readonly EmbeddingModelCount[];
}): EmbeddingConsistency {
  const { configuredModel } = input;
  if (configuredModel === null) return { state: 'off', configuredModel: null, mismatches: [] };
  const mismatches: EmbeddingMismatch[] = [
    ...input.chunks
      .filter((c) => c.count > 0 && c.model !== configuredModel)
      .map((c) => ({ source: 'kb_chunks' as const, model: c.model, count: c.count })),
    ...input.products
      .filter((p) => p.count > 0 && p.model !== configuredModel)
      .map((p) => ({ source: 'products' as const, model: p.model, count: p.count })),
  ];
  if (mismatches.length > 0) return { state: 'mismatch', configuredModel, mismatches };
  const total = [...input.chunks, ...input.products].reduce((n, c) => n + c.count, 0);
  return { state: total === 0 ? 'empty' : 'ok', configuredModel, mismatches: [] };
}

/** Nhánh vector chỉ dùng khi đã cấu hình và dữ liệu khớp (hoặc chưa có dữ liệu). */
export const vectorBranchUsable = (status: EmbeddingConsistency): boolean =>
  status.state === 'ok' || status.state === 'empty';

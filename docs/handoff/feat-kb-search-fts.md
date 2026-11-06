# Bàn giao `feat-kb-search-fts` (KB-SEARCH-FTS) — claude

## Đã làm
- Migration 0038: `kb_chunks.search_norm` + trigger `kb_chunks_fill_search` (điền `search_norm`, `tsv` theo `lang`), GIN trigram, `products.name_embedding` + GIN `search_text` (không HNSW — verifier-db), GRANT UPDATE (name_embedding).
- `packages/db/src/queries/kb-search.ts`: `searchKbChunks`, `searchProducts`, `findProductMatch`, `getProductRevs`, `setProductNameEmbedding` (xuất ở `runtime.ts`).
- `packages/shared/src/search.ts`: chuẩn hóa, `productSearchText`, RRF, `pickProductMatch`, `isProductCacheStale`.
- `packages/ai/src/embedding/`: interface `Embedder` + bản fixture (chưa có bản LiteLLM).
- Q: QKS1–QKS5; KT-KB-SEARCH; `CAN_BAN_CUNG_CAP` §2g; gap-matrix/MASTER/codemap.

## File đã đọc + điều rút ra
- Phiên này KHÔNG có DB cục bộ nên `kb-search.int.test.ts` chưa chạy được ở máy làn (không đặt được `CF_LANE`, không có Postgres); chạy ở CI/máy phụ trước khi merge: `CF_LANE=b pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/kb-search.int.test.ts` + `pnpm db:check-rls`.
- `withWorkspace` trần + UPDATE bị RLS lọc → 0 dòng (không ném lỗi).
- drizzle-kit sinh `meta/*.json` chưa theo biome → chạy `biome format --write` lên hai file meta.

## Còn lại (việc khác)
- Bản `Embedder` thật qua LiteLLM + ghi `ai_usage` (khi có khóa); worker điền `kb_chunks.embedding`/`embedding_model` (KB-CHUNKING).
- PIPE-RETRIEVE: rerank, ngưỡng liên quan, trần ~3.000 token, `hnsw.iterative_scan`; PRODUCT-ALIAS (bước bí danh); KB-EMBED-COL (HNSW cho `kb_chunks`); PIPE-CACHE-EXACT dùng `isProductCacheStale`.
- Nơi ghi sản phẩm phải gọi `productSearchText` + `setProductNameEmbedding`.

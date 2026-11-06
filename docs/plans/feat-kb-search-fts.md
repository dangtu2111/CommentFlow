# Kế hoạch `feat-kb-search-fts` — KB-SEARCH-FTS

## Việc

Mã gap matrix: `KB-SEARCH-FTS` (+ `PRODUCTS-SEARCH-COLUMNS`) · Spec: FR-057, FR-127, FR-135; `docs/10` §5, §5.1, §5.3.

**Tóm tắt:** Làm lớp tìm kiếm: (1) đoạn kiến thức tự có chỉ mục toàn văn theo ngôn ngữ (`simple`+`unaccent` cho vi, `english` cho en) và chỉ mục `pg_trgm` chịu gõ sai, truy vấn trộn vector + toàn văn + trigram bằng RRF (k=60) có lọc workspace/phiên bản/ngày hiệu lực/ngôn ngữ/sản phẩm; (2) tìm sản phẩm gần đúng (không dấu, gõ sai, vector tên) với ngưỡng — dưới ngưỡng thì không chọn; (3) cache không trả giá cũ: so `product_revs` đã lưu với `products.rev` hiện tại. Embedding đi qua interface `Embedder` + bản fixture (chưa gọi dịch vụ thật). Rủi ro: migration 0038 (làn b), trigger điền `tsv`.

## Điểm chưa rõ

Không có (quyết định tự chọn ghi ở `QUYET_DINH_CHO_DUYET.md` mã QKS1–QKS5).

## Tiêu chí nghiệm thu

1. `normalizeSearchText`: thường, bỏ dấu (kể cả đ), bỏ dấu câu, gộp khoảng trắng; lũy đẳng — test đơn vị shared (FR-127).
2. `reciprocalRankFusion` k=60 đúng công thức, ổn định theo thứ tự đầu vào, bỏ trùng — test đơn vị (FR-057).
3. `pickProductMatch`: điểm cao nhất dưới ngưỡng → không chọn; hơn hạng hai chưa đủ biên → mơ hồ, không chọn — test đơn vị (FR-127/128).
4. `isProductCacheStale`: lệch rev một sản phẩm, thiếu sản phẩm, thừa sản phẩm đều → trượt cache; khớp hết → dùng được — test đơn vị (FR-135).
5. `createFixtureEmbedder`: 1024 chiều, đã chuẩn hóa, xác định (cùng chữ → cùng vector), chữ gần giống thì cosine cao hơn chữ khác — test đơn vị `packages/ai`.
6. Trigger DB điền `kb_chunks.tsv`/`search_norm`: vi tìm được không dấu ("ao len" khớp "Áo len"), en dùng stemming ("shirts" khớp "shirt") — `pnpm test:db` (`kb-search.int.test.ts`).
7. `searchKbChunks`: trộn RRF; lọc chéo workspace (B không thấy của A), phiên bản, hết hạn `valid_until`, chưa tới `valid_from`, ngôn ngữ, `product_id` ngoài danh sách; lỗi gõ vẫn ra nhờ trigram; giới hạn `limit` — test tích hợp.
8. `searchProducts`: không dấu/gõ sai ra đúng sản phẩm; chéo workspace không thấy; sản phẩm `archived` bị bỏ — test tích hợp (FR-127).
9. `getProductRevs` + `isProductCacheStale`: đổi giá sản phẩm → rev tăng → cache trượt; đổi tên hoặc embedding → cache còn dùng — test tích hợp (FR-135).
10. `pnpm db:check-rls` đạt; migration có đường lùi; `cf_app` ghi được `name_embedding` (thành viên/hệ thống) nhưng không sửa `rev`.

## File sẽ đọc (đã đọc)

`docs/10` §5–5.3, `0033_kb_schema.sql`, `0034_products_variants.sql`, `schema/cf/kb.ts`, `schema/cf/products.ts`, `queries/products.ts`, `shared/src/products.ts`, `tests/products.int.test.ts` + `helpers.ts`.

## File sẽ sửa / tạo

- `packages/shared/src/search.ts` (+ `search.test.ts`), `index.ts` — chuẩn hóa tìm kiếm, RRF, chọn sản phẩm theo ngưỡng, kiểm cache theo `product_revs`.
- `packages/ai/src/embedding/{embedder,fixture-embedder}.ts` (+ test), `index.ts` — interface + bản fixture.
- `packages/db/migrations/0038_kb_search_fts.sql`, `meta/` — cột `products.name_embedding`, `kb_chunks.search_norm`, trigger điền `tsv`, chỉ mục GIN/HNSW.
- `packages/db/src/schema/cf/{products,kb}.ts` — cột/chỉ mục Drizzle.
- `packages/db/src/queries/kb-search.ts`, `runtime.ts` — `searchKbChunks`, `searchProducts`, `getProductRevs`, `setProductNameEmbedding`.
- `packages/db/tests/kb-search.int.test.ts`; docs: codemap, gap-matrix, MASTER, KIEM_TRA_TAY, QUYET_DINH, CAN_BAN_CUNG_CAP, docs/10, handoff.

## Migration

`0038_kb_search_fts.sql` (làn b). Đường lùi: `DROP TRIGGER kb_chunks_fill_search ON cf.kb_chunks; DROP FUNCTION cf.kb_chunks_fill_search(); ALTER TABLE cf.kb_chunks DROP COLUMN search_norm; ALTER TABLE cf.products DROP COLUMN name_embedding;` (chỉ mất dữ liệu dẫn xuất, tính lại được).

## Test viết trước

Toàn bộ test đơn vị (shared, ai) và test tích hợp viết trước khi code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/search.test.ts` · `pnpm --filter @flow/ai exec vitest run src/embedding` · `CF_LANE=b pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/kb-search.int.test.ts` · `pnpm --filter @flow/shared test:coverage` · `pnpm --filter @flow/ai test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` một lần (migration, trigger, chỉ mục, truy vấn có `workspace_id`).

## Rủi ro / câu hỏi cho chủ dự án

Không có câu hỏi. Rủi ro: `unaccent` không IMMUTABLE nên dùng trigger thay cột generated; HNSW trên `products` chưa lọc theo workspace (bảng nhỏ ở GĐ2; lọc sau khi quét).

## Đề xuất thay đổi

`docs/10` §3 (`kb_chunks.search_norm`, `products.name_embedding`, trigger) và §5 (nhánh trigram). Chưa có bảng `product_aliases` → bước bí danh §5.1 để việc riêng.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Không có bảng mới (chỉ cột/trigger/chỉ mục): quyền GHI giữ nguyên chính sách hiện có; `cf_app` thêm GRANT UPDATE (name_embedding) trên `products` (thành viên hoặc hệ thống, theo policy sẵn có); `kb_chunks` vẫn chỉ hệ thống ghi

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định ở QKS1–QKS5).

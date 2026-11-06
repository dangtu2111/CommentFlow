# Bàn giao `feat-pipe-cache-exact` (claude) — PIPE-CACHE-EXACT

**Đã làm:** `packages/ai/src/cache/exact-cache.ts` (khóa, `lookupExactCache`, `storeExactCache`, `ExactCacheStore` + bản bộ nhớ), `packages/db/src/queries/kb-version.ts` (`getCurrentKbVersion`), test đơn vị 19 ca + test tích hợp (chạy ở CI). Không migration (Q-PCX1).

**Đã đọc → rút ra:** `isProductCacheStale`/`getProductRevs` đã có (KB-SEARCH-FTS); `kb_versions` RLS đọc theo workspace; coverage `packages/ai` ngưỡng lines 100%.

**Còn lại:**
- Nối Redis thật (bản `ExactCacheStore`) và gọi lookup/store trong pipeline → `PIPE-ORCHESTRATOR`; cờ `cf.cache.answers` mặc định tắt cho đường thật.
- Xóa cache theo bài khi webhook giá; xóa bản sao khi bình luận bị xóa (FR-048) — khóa chỉ có băm nên cần chỉ mục khóa theo bình luận khi làm.
- Khi làm xuất bản kiến thức: INSERT `kb_versions` và gắn chunk trong cùng một giao dịch (verifier-db).
- Test `getCurrentKbVersion` thêm ca `withActor` người ngoài workspace và `withJob` (nên làm).

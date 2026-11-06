## KT-KB-SEARCH — Tìm kiếm kiến thức/sản phẩm (KB-SEARCH-FTS, FR-057/127/135) · Knowledge/product search

Chưa có giao diện (ô Thử AI là `KB-TRYAI`; nối pipeline là `PIPE-RETRIEVE`). Kiểm bằng lệnh trên DB thử. / No UI yet; verify with commands on a test DB.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm db:migrate` (DB `cf_dev`), rồi `pnpm db:check-rls`. | Migration 0038 áp được (cần extension `vector`, `unaccent`, `pg_trgm`); check-rls "đạt". |
| 2 | `pnpm --filter @flow/db test:db` (hoặc `CF_LANE=<làn> pnpm test:db`). | Mọi test xanh, gồm `kb-search.int.test.ts` (toàn văn không dấu, lỗi gõ, RRF, lọc hiệu lực/phiên bản/ngôn ngữ, chéo workspace, sản phẩm gần đúng, cache theo rev). |
| 3 | `pnpm --filter @flow/shared exec vitest run src/search.test.ts` và `pnpm --filter @flow/ai exec vitest run src/embedding`. | Xanh (chuẩn hóa, RRF, ngưỡng chọn sản phẩm, kiểm cache, embedding mock). |
| 4 | (Tùy chọn, `psql` trên `cf_dev`) `SELECT search_norm, tsv FROM cf.kb_chunks LIMIT 1;` sau khi có đoạn. | `search_norm` thường + không dấu; `tsv` có từ không dấu (vi). |

Nếu hỏng: dán tên test đỏ + dòng lỗi đầu tiên. / If it fails: paste the failing test name and the first error line.

---

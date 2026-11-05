# Kế hoạch `feat-products-variants` — PRODUCTS-VARIANTS

## Việc

Mã gap matrix: `PRODUCTS-VARIANTS` (MASTER 2A) · Spec: FR-129, FR-056, FR-058; `docs/10` §3 (`products`, `product_variants`), §5.2.

**Tóm tắt:** Tạo hai bảng `cf.products` và `cf.product_variants` (giá/tồn nằm ở biến thể, tra bằng SQL chứ không qua vector), có `products.rev` tự tăng khi giá/tồn/biến thể đổi (để cache không trả giá cũ), RLS theo workspace. Thêm hàm thuần chuẩn hóa thuộc tính (màu/size Việt–Anh), dựng văn bản đưa vào vector (loại giá/tồn) và kiểm "thẻ sản phẩm" (mỗi giá trị ≤ 600 ký tự). Rủi ro: migration (làn b); chưa có đồng bộ nguồn nên bảng chỉ có dữ liệu nhập tay/qua job sau này.

## Điểm chưa rõ

Không có (các lựa chọn tự quyết ghi ở `QUYET_DINH_CHO_DUYET.md` mã QPV1–QPV4).

## Tiêu chí nghiệm thu

1. `normalizeAttrs` đổi khóa/giá trị Việt→Anh (`mau: 'Đen'` → `color: 'black'`), lũy đẳng — kiểm bằng test đơn vị `packages/shared` (FR-129).
2. `productEmbeddingText` không chứa giá, tồn, số tiền; có tên, danh mục, thẻ, thuộc tính biến thể — test (FR-056).
3. `parseProductCard` từ chối giá trị > 600 ký tự và khóa lạ; chấp nhận thẻ rỗng — test (FR-058).
4. Bảng có RLS: workspace B không thấy/ghi/đổi được sản phẩm-biến thể của A; biến thể không gắn chéo workspace (FK ghép) — `pnpm test:db` (`products.int.test.ts`).
5. `products.rev` tăng khi giá/tồn/trạng thái biến thể đổi, khi thêm biến thể, khi giá/tồn/trạng thái sản phẩm đổi; KHÔNG tăng khi chỉ đổi tên; người dùng không tự đặt `rev` — test tích hợp.
6. Truy vấn `findActiveVariants` theo `attrs_norm @>` trả đúng biến thể còn hoạt động, không khớp → mảng rỗng — test tích hợp.
7. `pnpm db:check-rls` đạt; `cf_app` không có DELETE; thành viên (Owner+Staff) và hệ thống ghi được, người không phải thành viên không ghi được.

## File sẽ đọc (≤ ~8, kèm lý do)

`docs/10` §3/§5.2 (cột), `0019_ch_schema.sql` (mẫu policy), `schema/cf/posts.ts` (mẫu Drizzle), `check-rls.ts` (khai báo bảng), `tests/helpers.ts` + `ch-schema.int.test.ts` (mẫu test), `packages/shared/src/index.ts`.

## File sẽ sửa / tạo

- `packages/shared/src/products.ts` (+ test), `index.ts` — chuẩn hóa thuộc tính, văn bản vector, thẻ sản phẩm.
- `packages/db/src/schema/cf/products.ts`, `index.ts` — Drizzle schema.
- `packages/db/migrations/0031_products_variants.sql`, `meta/` — bảng, RLS, trigger `rev`.
- `packages/db/src/check-rls.ts` — khai báo policy/NO_DELETE/cột không UPDATE.
- `packages/db/src/queries/products.ts`, `runtime.ts` — `findActiveVariants`.
- `packages/db/tests/products.int.test.ts`; docs: codemap, gap-matrix, MASTER, KIEM_TRA_TAY, QUYET_DINH, docs/10, handoff.

## Migration

`0031_products_variants.sql` (làn b). Đường lùi: `DROP TABLE cf.product_variants, cf.products CASCADE; DROP FUNCTION cf.bump_product_rev_from_product(), cf.bump_product_rev_from_variant()` (mất dữ liệu sản phẩm; chưa có code ghi nên an toàn trước khi có nguồn đồng bộ).

## Test viết trước

Test đơn vị shared (3 hàm) và test tích hợp RLS/rev/truy vấn viết trước khi code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/products.test.ts` · `CF_LANE=b pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/products.int.test.ts` · `pnpm --filter @flow/shared test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration + RLS + trigger SECURITY DEFINER).

## Rủi ro / câu hỏi cho chủ dự án

Không có câu hỏi. Rủi ro: trigger `rev` chạy DEFINER — đã giới hạn theo `workspace_id` + id của dòng.

## Đề xuất thay đổi

`docs/10` §3: `name_embedding` + chỉ mục GIN trigram thêm ở KB-SEARCH-FTS (cần pgvector/pg_trgm); thẻ sản phẩm lưu cột `card jsonb`.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": GHI cho thành viên đang hoạt động (Owner+Staff, `withActor`) hoặc hệ thống (`withJob`); không DELETE.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở QPV1–QPV4).

# Handoff `feat-products-variants` (claude, làn b)

## Đã làm
- `packages/shared/src/products.ts` (+test): `normalizeAttrs` (FR-129), `parseProductCard` (FR-058), `productEmbeddingText` (FR-056).
- Migration `0034_products_variants.sql` (đánh lại từ 0031 khi merge main) + `schema/cf/products.ts`: `cf.products`, `cf.product_variants`, RLS (thành viên/hệ thống ghi, không DELETE), trigger `rev`, quyền cột (rev/khóa định danh).
- `check-rls.ts` khai báo hai bảng; `queries/products.ts` `findActiveVariants`; test tích hợp `tests/products.int.test.ts`.
- Quyết định QPV1–QPV4 trong `docs/plans/QUYET_DINH_CHO_DUYET.md`; `docs/10` thêm cột `card`.

## Đã đọc và rút ra
- Mẫu bảng/policy: `0019_ch_schema.sql`; `cf_worker` kế thừa quyền `cf_app` nên chỉ cần GRANT cho `cf_app`.
- Quyền cột INSERT/UPDATE là cách chặn sửa `rev`/khóa; trigger DEFINER cần để tăng `rev` từ biến thể.

## Còn lại / lưu ý
- **`CF_LANE=b pnpm test:db` + `pnpm db:check-rls` CHƯA chạy được** trong phiên này (shell không cho đặt `CF_LANE`; DB `cf_test` mặc định thiếu role `cf_worker`). Phải chạy trước khi merge; nếu đỏ, sửa 0034/check-rls.
- verifier-db: đã sửa "Chặn merge" (`= IN` → `IN`), thêm hai trigger vào check-rls, bỏ quyền sửa `variants.external_id`. Chưa làm (ghi nhận): cờ tường minh thay `pg_trigger_depth()`, CHECK `external_id` cho nguồn khác `manual`, bỏ index `product_variants_product_idx` thừa, trigger mức câu lệnh, thêm test (FK chéo qua đường người dùng, ON CONFLICT withJob).
- Chưa có: `name_embedding`/chỉ mục trigram (KB-SEARCH-FTS), nhập/đồng bộ nguồn, trang Sản phẩm + API (xem gap matrix `PRODUCTS-SEARCH-COLUMNS`, `PRODUCTS-UI-API`).

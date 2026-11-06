# Kế hoạch `feat-product-alias` — Bí danh sản phẩm

## Việc

Mã gap matrix: `PRODUCT-ALIAS` · Spec: FR-128, US-100, `docs/10_Database_Design.md` §3 `product_aliases` + §5.1, `docs/11` `/products/:id/aliases`.

**Tóm tắt:** Thêm bảng `cf.product_aliases` (tên gọi riêng của shop cho sản phẩm, vd "mẫu hồng") có RLS (khóa dữ liệu theo workspace), các truy vấn tạo/liệt kê/xóa và tìm sản phẩm theo bí danh (khớp gần đúng, không dấu), rồi cho bước tìm sản phẩm hiện có thử bí danh trước. Rủi ro: sai ngưỡng khớp làm AI chọn nhầm sản phẩm → ngưỡng 0,6 + biên mơ hồ dùng chung `pickProductMatch` (mơ hồ → hỏi lại, không đoán).

## Điểm chưa rõ

Không có (mọi quyết định ghi ở Q-PA1, tự chọn phương án an toàn).

## Tiêu chí nghiệm thu

1. `parseProductAlias` cắt khoảng trắng, tính `aliasNorm` (không dấu, thường), từ chối rỗng/quá dài/chỉ ký hiệu, mặc định nguồn `staff`; `ai_suggested` đòi người xác nhận — kiểm bằng: `packages/shared/src/product-alias.test.ts` (FR-128).
2. Owner và Staff thêm/xóa/liệt kê bí danh của sản phẩm; trùng (alias_norm, sản phẩm) → lỗi 23505; Staff/Owner workspace khác không thấy, không ghi được (RLS); `confirmed_by` không giả được người khác — kiểm bằng: `packages/db/tests/product-aliases.int.test.ts` (CI; làn không chắc có DB).
3. "ao hong" khớp bí danh "Mẫu hồng" ≥ 0,6 → trả đúng sản phẩm; dưới ngưỡng → không chọn; hai sản phẩm cùng bí danh sát nhau → mơ hồ; sản phẩm `archived`/workspace khác không bao giờ trả — kiểm bằng: test tích hợp trên.
4. `findProductMatch` thử bí danh trước; không đủ tin cậy thì rơi về tìm tên/SKU như cũ (không đổi hành vi khi không có bí danh) — kiểm bằng: `kb-search.int.test.ts` (đã có) vẫn xanh + ca mới.
5. `pnpm db:check-rls` đạt: bảng mới có RLS, GRANT không có UPDATE, ghi theo thành viên — kiểm bằng: `check-rls.ts` danh sách kỳ vọng + `check-rls.test.ts`.

## File sẽ đọc

Đã đọc: `docs/10` §3/§5.1, `abbreviations` (schema/query/migration 0041, mẫu RLS), `products.ts` (schema), `kb-search.ts` (`searchProducts`/`findProductMatch`), `shared/src/search.ts`, `check-rls.ts` (các mảng kỳ vọng).

## File sẽ sửa / tạo

- `packages/shared/src/product-alias.ts` (+ test, + export ở `index.ts`): kiểm đầu vào, hằng `ALIAS_MATCH_THRESHOLD`.
- `packages/db/src/schema/cf/product-aliases.ts` (+ `index.ts`): bảng Drizzle.
- `packages/db/migrations/0043_product_aliases.sql` (+ `meta/` do drizzle-kit): bảng, RLS, GRANT, GIN trigram.
- `packages/db/src/queries/product-aliases.ts`, `runtime.ts`: tạo/liệt kê/xóa/`searchProductsByAlias`.
- `packages/db/src/queries/kb-search.ts`: `findProductMatch` thử bí danh trước.
- `packages/db/src/check-rls.ts` (+ test nếu cần): kỳ vọng bảng mới.
- `packages/db/tests/product-aliases.int.test.ts`.
- Docs: `docs/10` (thực tế), `QUYET_DINH_CHO_DUYET.md`, `CAN_BAN_CUNG_CAP.md` (không cần: không tài nguyên ngoài), `KIEM_TRA_TAY.md` (chưa có UI → không), `gap-matrix`, `MASTER`, `codemap` (dòng riêng), handoff.

## Migration

`0043_product_aliases.sql` (số kế tiếp sau 0042 trên origin/main; fetch lại trước khi push). Tạo `cf.product_aliases` + FK ghép `(workspace_id, product_id)` → `products` (xóa cascade) + RLS + GRANT SELECT/INSERT(cột)/DELETE + GIN `gin_trgm_ops(alias_norm)`. Đường lùi: `DROP TABLE cf.product_aliases`.

## Test viết trước

`product-alias.test.ts` (đỏ vì chưa có module) và `product-aliases.int.test.ts` trước khi viết truy vấn/migration.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/product-alias.test.ts` · `CF_LANE=b pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/product-aliases.int.test.ts` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` một lần (migration + RLS + truy vấn tìm kiếm).

## Rủi ro / câu hỏi cho chủ dự án

Chưa làm: API/UI tab "Bí danh", bảng gợi ý chờ xác nhận (`/aliases/suggestions`), nối `resolveProducts` vào pipeline → ghi gap matrix.

## Đề xuất thay đổi

Cập nhật `docs/10` §3 `product_aliases` phần "Thực tế" theo Q-PA1.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": `product_aliases` ghi theo thành viên (Owner/Staff, FR-128) hoặc hệ thống; không dùng `is_workspace_owner`

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-PA1).

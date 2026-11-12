# Kế hoạch `feat/kb-catalog-ui` — trang Danh mục sản phẩm (kb-catalog)

## Việc

Mã gap matrix: UI KB (Phần 4a), màn `design/stitch/kb-catalog.html`. Trước đây (Q-KB-UI-POL) chưa dựng vì thiếu trang danh sách sản phẩm; nay chủ dự án yêu cầu làm tiếp theo thứ tự (kb-catalog → kb-rules → Phần 4b–e).

**Tóm tắt (2–3 câu dễ hiểu):** Thêm trang chỉ đọc `/app/kb/catalog`: danh sách sản phẩm đã nạp (Shopify, Excel, nhập tay) với tìm theo tên/SKU, lọc nguồn, đang bán/ngừng bán, phân trang; giá và tồn kho đọc thẳng từ dữ liệu sản phẩm. Những phần thiết kế có nhưng chưa có nền tảng (ghi chú riêng cho AI, giá Flash Sale, quy tắc điều hướng, lọc tồn kho/AI, thêm/xuất sản phẩm, so sánh/xuất bản theo sản phẩm, ảnh) là nút/ô tắt "Sắp có", không số mẫu. Không migration; không ghi dữ liệu.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Owner xem được danh sách THẬT của workspace; Staff nhận 404; workspace khác không thấy.
2. Tìm theo tên/SKU (không phân biệt hoa thường; `%`, `_` là chữ thường), lọc nguồn, đang bán/ngừng bán, phân trang; số trên các tab nguồn đúng theo tìm kiếm/trạng thái.
3. Giá VND theo đồng, tiền tệ khác theo đơn vị nhỏ nhất của tiền tệ gốc (không quy đổi); tồn: chưa có/hết/sắp hết (< 10)/còn.
4. Tham số URL lạ rơi về mặc định (không đi thẳng vào truy vấn).
5. Rail KB có mục "Danh mục sản phẩm" là liên kết thật; không tràn ngang ở 1440/390 (bảng cuộn ngang trong khung).
6. typecheck, `lint:i18n`, biome, test web/db xanh.

## File sẽ đọc / sửa

Đọc: `design/stitch/kb-catalog.{html,png}`, `packages/db/src/schema/cf/products.ts`, `kb-frame.tsx`, `kb-structure.ts`, `app-nav.ts`.
Thêm: `packages/db/src/queries/catalog-list.ts` (+ `tests/catalog-list.int.test.ts`), `apps/web/src/lib/catalog-view.ts` (+test), `apps/web/src/app/app/(guarded)/kb/catalog/page.tsx`.
Sửa: `packages/db/src/runtime.ts`, `lib/app-nav.ts`, `lib/kb-structure.ts`, `components/kb/kb-frame.tsx`, `components/app/shell-nav.tsx`, i18n `vi/en`, `e2e/tests/kb-content.spec.ts`.

## Migration

Không.

## Test viết trước

`catalog-list.int.test.ts` (5 ca: mặc định/đếm nguồn, lọc nguồn + đếm theo tìm kiếm, tìm kiếm + ký tự đại diện, ngừng bán + phân trang, workspace khác), `catalog-view.test.ts` (10 ca), E2E "Danh mục sản phẩm: trang chỉ đọc…".

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db tests/catalog-list.int.test.ts` · `pnpm --filter @flow/web test` · `pnpm e2e e2e/tests/kb-content.spec.ts`.

## Cần kiểm chứng độc lập không?

Không (chỉ đọc, không đụng auth/RLS/migration; dùng `withActor` + RLS sẵn có, Owner-only).

## Rủi ro / câu hỏi cho chủ dự án

- Không hiện ảnh sản phẩm (ảnh ở CDN của nguồn; chưa cấu hình cho phép tải ảnh ngoài) — thay bằng biểu tượng.
- Chưa chụp ảnh `ui:fidelity kb-catalog` trước/sau (mức lệch đo ở Phần 4a sau khi có dữ liệu mẫu).
- Danh sách không có "biến thể" chi tiết, chỉ số biến thể đang hoạt động.

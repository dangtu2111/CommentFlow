# Handoff feat/kb-wire-content (claude)

**Đã làm:** `/app/kb` ("Nguồn dữ liệu") dựng theo Stitch với số liệu thật (`loadKbOverview`: đếm bảng, nguồn `kb_sources`, một sản phẩm mẫu); bốn trang nhập tay `/app/kb/{shop,policies,faq,voice}` (Server Action Owner + `withActor`, `parse*` của `@flow/shared`); rail theo Stitch + mục "Sắp có" (Tài liệu, Quy tắc & Giới hạn, Từ điển viết tắt).

**File đã đọc + điều rút ra:**
- Backend ghi (`upsertShopProfile`, `createFaqItem`…) đã có từ `KB-SHOP-POLICY-FAQ`; thiếu phần ĐỌC → thêm `list*` + `loadKbOverview` ở `queries/kb-content.ts`.
- `require-app-user.scan.test.ts` bắt buộc MỖI action `'use server'` tự gọi `requireAppUser(` trong thân hàm (không gọi gián tiếp qua hàm phụ).
- `app-nav.ts` là nguồn duy nhất của khóa điều hướng: thêm khóa mới phải thêm vào `ENTRIES`, `shell-nav.tsx` (icon), i18n `shell.nav.*`.
- Lint i18n chỉ nhận hàm tên `t`; chuỗi trong thuộc tính JSX/đối tượng phải là hằng số.
- Tên truy cập của ô nhập: chú thích (hint) phải nằm NGOÀI `<label>` (E2E dùng `getByLabel(..., { exact: true })`).
- Chạy E2E cục bộ khi `.env` bật Facebook: đặt `FB_OAUTH_ENABLED=false` (DB test có kênh dùng khóa v2–v4, web không khởi động nổi).

**Đã chạy thật:** `kb-content-read.int.test.ts` (4), `kb-content-form.test.ts` (12), web 705 test, `lint:i18n`, typecheck, E2E `kb-content.spec.ts` 12/12 (vi+en); thử tay trên trình duyệt: tạo/xóa FAQ ở dev.

**Còn lại:** (3) danh sách sản phẩm + bí danh (`PRODUCTS-UI-API`, `PRODUCT-ALIAS`); Shopify (`SHOPIFY-CONNECT-STORE`, cần migration); crawl URL; tài liệu PDF; Quy tắc & Giới hạn (`KB-SCOPE-CHANNEL`, cần migration); Từ điển viết tắt; "Áp dụng cho kênh"; Diff phiên bản; ô chạy thử nhúng trực tiếp (hiện chỉ liên kết sang Chạy thử). Bốn trang nhập tay chưa có màn Stitch riêng — đề nghị tạo màn thiết kế (xem `docs/plans/ui-thieu-thiet-ke.md`).

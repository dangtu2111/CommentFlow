# Bàn giao `feat/kb-catalog-ui` (Claude Code)

## Đã làm
- `listCatalogProducts` (DB, chỉ đọc) + trang `/app/kb/catalog` + `catalog-view.ts` (thuần) + mục rail "Danh mục sản phẩm" (đứng trước "Nhập sản phẩm").
- Phần chưa có nền tảng là mục tắt "Sắp có" (ghi chú AI, Flash Sale, lọc tồn kho/AI, thêm/xuất sản phẩm).

## File đã đọc + điều rút ra
- `products` có `source`, `status`, giá VND hoặc `price_minor` theo `currency_code`; `product_variants.status` để đếm biến thể.
- Quy tắc lint i18n: hàm dịch phải tên `t`; không để chuỗi chữ trong biểu thức JSX.

## Việc còn lại
- Chụp ảnh `ui:fidelity kb-catalog`; bật ghi chú AI/Flash Sale khi có mô hình lưu.
- Tiếp: đo distill@2 trên Shop Thử 2, kb-rules (migration chỉ-thêm), Phần 4b–e.

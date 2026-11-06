## 2z. Shopify — đối soát giá/tồn và kiểm webhook — `SHOPIFY-RECONCILE` (FR-112/113)
Logic đối soát + job (mock) đã xong; cờ `SHOPIFY_ENABLED` mặc định TẮT. Để chạy thật bạn cần ngoài mục 2y:
1. **Shopify dev store + app** như 2y; thêm quyền đọc danh sách webhook của app (đọc `webhookSubscriptions` không cần scope riêng, nhưng **đăng ký lại webhook thiếu** là thao tác GHI — kiểm lại trên tài liệu Shopify xem app đã đủ quyền chưa; chưa làm ở mock).
2. Xác nhận trên tài liệu Shopify tên các chủ đề webhook (`PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `INVENTORY_LEVELS_UPDATE`, `APP_UNINSTALLED`) và truy vấn `webhookSubscriptions` ở phiên bản API đã ghim.
3. Phần chưa làm (cần bảng mới → làn b): lưu kết nối cửa hàng + token, bảng `reconcile_runs`/`reconcile_diffs` + trạng thái duyệt, lịch 02:00 theo múi giờ workspace, nút "Đối soát ngay" và trang Nguồn dữ liệu.
Kiểm tay: KT-SRC.

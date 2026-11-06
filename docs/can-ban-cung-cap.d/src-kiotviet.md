## 2zz1. KiotViet (đọc sản phẩm/tồn) — `SRC-KIOTVIET` (FR-122)
Code connector chỉ đọc đã xong và chạy bằng dữ liệu ghi sẵn; cờ `KIOTVIET_ENABLED` (worker) mặc định TẮT. Để chạy thật bạn cần:
1. **Tài khoản KiotViet + một cửa hàng dev** (tên cửa hàng = giá trị header `Retailer`) có vài sản phẩm/biến thể (giá VND, số nguyên đồng) và tồn kho.
2. **Client ID + Client Secret** tạo trong KiotViet (Thiết lập cửa hàng → Thiết lập kết nối API), scope `PublicApi.Access`. Mỗi cửa hàng có cặp riêng nên sẽ lưu theo workspace (chưa có chỗ lưu, xem mục 4); không dán vào chat/issue/log.
3. Nếu dùng webhook: đăng ký webhook trong KiotViet với một **bí mật** → đặt `KIOTVIET_WEBHOOK_SECRET` ở `.env` (xác minh chữ ký `X-Hub-Signature`).
4. Xác nhận trên tài liệu chính thức https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/public-api/: đường dẫn `/products`, tham số `currentItem`/`pageSize`/`includeInventory`, header `Retailer` + `Authorization: Bearer`, địa chỉ lấy token `https://id.kiotviet.vn/connect/token`, tên trường `masterProductId`/`hasVariants`/`allowsSale`/`inventories[].onHand`, định dạng chữ ký webhook (code viết theo tài liệu công khai/thư viện cộng đồng, chưa kiểm với shop thật).
5. Phần chưa làm (cần bảng mới → làn b): lưu tên cửa hàng + Client ID/Secret mã hóa theo workspace (`KIOTVIET-CONNECT-STORE`), job đồng bộ, route webhook, đối soát. Khi các phần đó xong mới bật cờ.
Kiểm tay: KT-KIO.

## 2z. Haravan (đọc sản phẩm/tồn) — `SRC-HARAVAN` (FR-122)
Code connector chỉ đọc đã xong và chạy bằng dữ liệu ghi sẵn; cờ `HARAVAN_ENABLED` (worker) mặc định TẮT. Để chạy thật bạn cần:
1. **Tài khoản đối tác Haravan (Partners) + một shop dev** có vài sản phẩm/biến thể (giá VND, số nguyên đồng).
2. **Một Haravan app** với scope chỉ đọc: `com.read_products`, `com.read_inventories` (docs/12 §4). Lấy **Client secret** → đặt `HARAVAN_APP_SECRET` ở `.env` (chỉ dùng xác minh chữ ký webhook `X-Haravan-Hmac-Sha256`; không dán vào chat/issue/log).
3. Xác nhận trên tài liệu Haravan: đường dẫn `products.json`, giới hạn `limit` 250 và header `X-Haravan-Api-Call-Limit` (code viết theo tài liệu công khai, chưa kiểm với shop thật).
4. Phần chưa làm (cần bảng mới → làn b): OAuth cài app + lưu token cửa hàng (`HARAVAN-CONNECT-STORE`), job đồng bộ, route webhook, đối soát. Khi các phần đó xong mới bật cờ.
Kiểm tay: KT-HRV.

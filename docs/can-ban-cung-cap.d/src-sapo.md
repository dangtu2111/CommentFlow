## 2zz. Sapo (đọc sản phẩm/tồn) — `SRC-SAPO` (FR-122)
Code connector chỉ đọc đã xong và chạy bằng dữ liệu ghi sẵn; cờ `SAPO_ENABLED` (worker) mặc định TẮT. Để chạy thật bạn cần:
1. **Tài khoản Sapo + một cửa hàng dev** (`<tên>.mysapo.net`) có vài sản phẩm/biến thể (giá VND, số nguyên đồng).
2. **Một Sapo app** (hoặc private app) với quyền chỉ đọc sản phẩm và tồn kho. Lấy **Client secret** → đặt `SAPO_APP_SECRET` ở `.env` (chỉ dùng xác minh chữ ký webhook `X-Sapo-Hmac-Sha256`; không dán vào chat/issue/log).
3. Xác nhận trên tài liệu Sapo Web API: đường dẫn `/admin/products.json`, header token `X-Sapo-Access-Token`, giới hạn `limit` 250, header `X-Sapo-Api-Call-Limit`, tên trường `published_on` (code viết theo tài liệu công khai, chưa kiểm với shop thật).
4. Phần chưa làm (cần bảng mới → làn b): OAuth cài app + lưu token/tên cửa hàng (`SAPO-CONNECT-STORE`), job đồng bộ, route webhook, đối soát. Khi các phần đó xong mới bật cờ.
Kiểm tay: KT-SAP.

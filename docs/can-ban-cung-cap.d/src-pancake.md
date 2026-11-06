## 2zz2. Pancake POS (đọc sản phẩm/tồn) — `SRC-PANCAKE` (FR-122)
Code connector chỉ đọc đã xong và chạy bằng dữ liệu ghi sẵn; cờ `PANCAKE_ENABLED` (worker) mặc định TẮT. Để chạy thật bạn cần:
1. **Tài khoản Pancake POS + một shop dev** có vài sản phẩm/biến thể (giá VND số nguyên đồng) và tồn kho; ghi lại **mã shop** (số, `SHOP_ID`).
2. **API key** của shop (Pancake POS → Cài đặt → Cấu hình ứng dụng/Webhook-API). Mỗi shop có khóa riêng nên sẽ lưu mã hóa theo workspace (chưa có chỗ lưu, xem mục 4); không dán vào chat/issue/log.
3. Xác nhận trên tài liệu chính thức https://docs.pancake.vn/: địa chỉ `https://pos.pages.fm/api/v1/shops/{SHOP_ID}/products`, tham số `api_key`/`page_number`/`page_size`, tên trường `variations[].custom_id`/`retail_price`/`remain_quantity`/`fields`/`is_hidden`, `total_pages` (spec ghi tài liệu công khai còn chưa rõ; code viết theo tài liệu công khai/thư viện cộng đồng, chưa kiểm với shop thật). Xác nhận cả việc có webhook sản phẩm có chữ ký hay không (hiện chưa làm).
4. Phần chưa làm (cần bảng mới → làn b): lưu mã shop + API key mã hóa theo workspace (`PANCAKE-CONNECT-STORE`), job đồng bộ, đối soát. Khi các phần đó xong mới bật cờ.
Kiểm tay: KT-PAN.

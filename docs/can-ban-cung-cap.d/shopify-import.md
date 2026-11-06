## 2y. Shopify (đọc sản phẩm/tồn/chính sách) — `SHOPIFY-IMPORT` (FR-052)
Code connector chỉ đọc đã xong và chạy bằng dữ liệu ghi sẵn; cờ `SHOPIFY_ENABLED` (worker) mặc định TẮT. Để chạy thật bạn cần:
1. **Shopify dev store** (miễn phí qua Shopify Partners) có vài sản phẩm/biến thể, và đặt tiền tệ cửa hàng là **VND** (tiền tệ khác thì giá bị bỏ trống — hệ thống không tự quy đổi, Q-SHI1).
2. **Một Shopify app** (custom/public) với scope chỉ đọc: `read_products`, `read_inventory`, `read_legal_policies`, `read_content` (docs/12 §4.1). Lấy **Client secret** → đặt `SHOPIFY_API_SECRET` ở `.env` (chỉ dùng xác minh chữ ký webhook; không dán vào chat/issue/log).
3. Xác nhận **phiên bản Admin API** trên tài liệu Shopify (mặc định trong code `2026-07`, đổi bằng `SHOPIFY_API_VERSION`).
4. Phần chưa làm (cần bảng mới → làn b, và dev store để thử): OAuth cài app + lưu token cửa hàng, job đồng bộ, route webhook, đối soát đêm (`SHOPIFY-RECONCILE`). Khi các phần đó xong mới bật cờ.
Kiểm tay: KT-SHI.

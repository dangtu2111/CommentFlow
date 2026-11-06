## KT-KIO — Nhập sản phẩm từ KiotViet (SRC-KIOTVIET, FR-122, feat-src-kiotviet)

> Chưa có giao diện/job; kiểm bằng test + (khi có shop dev KiotViet) một script thử. / No UI yet; verify via tests and, once a KiotViet dev store exists, a one-off script.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/connectors exec vitest run src/kiotviet` | Mọi test xanh (phân trang, gom biến thể, lỗi 401/403/429, token, chuẩn hóa, chữ ký webhook, từ chối tên cửa hàng sai dạng). |
| 2 | Không đặt `KIOTVIET_ENABLED` trong `.env` | Cờ tắt; không có lệnh gọi mạng nào tới KiotViet. |
| 3 | (Có shop dev) Dựng token provider + connector với tên cửa hàng và Client ID/Secret, chạy `fetchCatalog()` | Trả đủ sản phẩm kèm biến thể; chuẩn hóa chỉ giữ sản phẩm/biến thể đang bán; giá là số nguyên đồng; tồn = tổng các chi nhánh. |
| 4 | Đặt giá lẻ (ví dụ 12.5) cho một sản phẩm rồi chạy lại | Giá sản phẩm đó trống (không làm tròn). |
| 5 | Dùng Client Secret sai | Lỗi `TOKEN_EXPIRED`, thông báo không chứa Client ID/Secret. |
| 6 | Truyền tên cửa hàng có khoảng trắng hoặc ký tự xuống dòng | Dựng connector bị từ chối. |

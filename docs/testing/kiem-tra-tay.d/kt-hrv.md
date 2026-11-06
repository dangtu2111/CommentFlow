## KT-HRV — Nhập sản phẩm từ Haravan (SRC-HARAVAN, FR-122, feat-src-haravan)

> Chưa có giao diện/job; kiểm bằng test + (khi có tài khoản dev Haravan) một script thử. / No UI yet; verify via tests and, once a Haravan dev account exists, a one-off script.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/connectors exec vitest run src/haravan` | Mọi test xanh (phân trang, bucket, lỗi 401/403/429, chuẩn hóa, chữ ký webhook). |
| 2 | Không đặt `HARAVAN_ENABLED` trong `.env` | Cờ tắt; không có lệnh gọi mạng nào tới Haravan. |
| 3 | (Có tài khoản dev) Dựng connector với token chỉ đọc, chạy `fetchCatalog()` | Trả đủ sản phẩm đã xuất bản kèm biến thể; giá là số nguyên đồng; tồn chỉ có với biến thể có quản lý tồn. |
| 4 | Đặt giá lẻ (ví dụ 12.5) cho một biến thể rồi chạy lại | Giá biến thể đó trống (không làm tròn). |
| 5 | Dùng token sai/hết hạn | Lỗi `TOKEN_EXPIRED`, thông báo không chứa token. |

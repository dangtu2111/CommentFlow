## KT-SAP — Nhập sản phẩm từ Sapo (SRC-SAPO, FR-122, feat-src-sapo)

> Chưa có giao diện/job; kiểm bằng test + (khi có shop dev Sapo) một script thử. / No UI yet; verify via tests and, once a Sapo dev store exists, a one-off script.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/connectors exec vitest run src/sapo` | Mọi test xanh (phân trang, bucket, lỗi 401/403/429, chuẩn hóa, chữ ký webhook, từ chối tên miền lạ). |
| 2 | Không đặt `SAPO_ENABLED` trong `.env` | Cờ tắt; không có lệnh gọi mạng nào tới Sapo. |
| 3 | (Có shop dev) Dựng connector với `shopDomain` + token chỉ đọc, chạy `fetchCatalog()` | Trả đủ sản phẩm kèm biến thể; chuẩn hóa chỉ giữ sản phẩm đã xuất bản; giá là số nguyên đồng; tồn chỉ có với biến thể có quản lý tồn. |
| 4 | Đặt giá lẻ (ví dụ 12.5) cho một biến thể rồi chạy lại | Giá biến thể đó trống (không làm tròn). |
| 5 | Dùng token sai/hết hạn | Lỗi `TOKEN_EXPIRED`, thông báo không chứa token. |
| 6 | Truyền `shopDomain` không phải `*.mysapo.net` | Dựng connector bị từ chối. |

## KT-PAN — Nhập sản phẩm từ Pancake POS (SRC-PANCAKE, FR-122, feat-src-pancake)

> Chưa có giao diện/job; kiểm bằng test + (khi có shop dev Pancake) một script thử. / No UI yet; verify via tests and, once a Pancake dev shop exists, a one-off script.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/connectors exec vitest run src/pancake` | Mọi test xanh (phân trang, biến thể, lỗi 401/403/429, chuẩn hóa, từ chối mã shop sai dạng, không lộ khóa). |
| 2 | Không đặt `PANCAKE_ENABLED` trong `.env` | Cờ tắt; không có lệnh gọi mạng nào tới Pancake. |
| 3 | (Có shop dev) Dựng connector với mã shop và API key, chạy `fetchCatalog()` | Trả đủ sản phẩm kèm biến thể; chuẩn hóa chỉ giữ sản phẩm/biến thể không ẩn; giá là số nguyên đồng; tồn là số nguyên ≥ 0. |
| 4 | Đặt giá lẻ (ví dụ 12.5) cho một sản phẩm rồi chạy lại | Giá sản phẩm đó trống (không làm tròn). |
| 5 | Dùng API key sai | Lỗi `TOKEN_EXPIRED`, thông báo cố định không chứa API key hay URL. |
| 6 | Truyền mã shop có chữ, dấu `/` hoặc `?` | Dựng connector bị từ chối. |

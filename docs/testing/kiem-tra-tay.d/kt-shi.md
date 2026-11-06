## KT-SHI — Nhập sản phẩm từ Shopify (SHOPIFY-IMPORT, FR-052, feat-shopify-import)

> Chưa có giao diện/job; kiểm bằng test + (khi có dev store) một script thử. / No UI yet; verify via tests and, once a dev store exists, a one-off script.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/connectors exec vitest run src/shopify` | Mọi test xanh (fixture 2 trang, throttle, lỗi 401/403/429, chữ ký webhook). |
| 2 | Mở `.env`/env.example: không đặt `SHOPIFY_ENABLED` | Cờ tắt; không có lệnh gọi mạng nào tới Shopify. |
| 3 | (Có dev store) Dựng connector với domain `<tên>.myshopify.com` + token chỉ đọc, chạy `fetchCatalog()` | Trả đủ sản phẩm ACTIVE kèm biến thể; giá VND là số nguyên; tồn chỉ có với biến thể theo dõi tồn. |
| 4 | Đặt tiền tệ cửa hàng khác VND rồi chạy lại | Giá/giá gốc đều trống (không quy đổi). |
| 5 | Dùng domain không phải `*.myshopify.com` | Bị từ chối ngay, không gọi mạng. |

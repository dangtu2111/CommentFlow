## KT-AH — Tự ẩn bình luận chứa SĐT/link (AUTO-HIDE, FR-081, feat-auto-hide)

> Hiện chỉ có logic + test; chưa nối pipeline/giao diện nên chưa có bước bấm trên web. Bước dưới là kiểm bằng máy. / Logic + tests only; no UI/pipeline wiring yet.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/autohide` | Tất cả test xanh (22). |
| 2 | Mở `env.example` | Có tên biến `AUTO_HIDE_ENABLED=` để trống (cờ tắt mặc định). |
| 3 | Khi có `AUTO-HIDE-DB` + `AUTO-HIDE-WIRE`: bật cờ + quy tắc Tự ẩn có `shadow_until`, gửi bình luận mẫu chứa SĐT từ Page thử | Trong thời gian shadow: chỉ có dòng "sẽ ẩn", bình luận chưa bị ẩn; sau đó bình luận bị ẩn và khách xuất hiện trong Khách tiềm năng TRƯỚC khi ẩn. |
| 4 | Gửi bình luận không SĐT/link nhưng bị AI gán nhãn spam | KHÔNG bị ẩn (AI không tự ẩn). |

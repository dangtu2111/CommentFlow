## KT-AC — Hiệu chuẩn ngưỡng tự gửi + độ tin cậy (AUTO-CALIBRATION, FR-072, FR-163, feat-auto-calibration)

> Chưa nối DB/giao diện nên kiểm bằng lệnh. / Not wired to DB/UI yet — verify by command.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/calibration` | Mọi test xanh (gồm property-based: đề xuất luôn trong [0,80; 0,99]; < 50 mẫu không đề xuất; trọng số hồi quy luôn hợp lệ). / All green. |

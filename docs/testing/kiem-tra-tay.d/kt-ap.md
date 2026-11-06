## KT-AP — AI tự tạm dừng khi bất thường (AUTO-PAUSE, FR-073)

Chỉ phần máy (chưa có job/banner, chưa ghi DB): người thử chạy test.
1. `pnpm --filter @flow/ai exec vitest run src/autopause` → 2 file xanh. Kết quả mong đợi: không test đỏ (Đánh dấu sai >10% và lỗi liên tiếp làm dừng workspace, lỗi 368 chỉ khóa kênh, spike chỉ cảnh báo, chỉ Owner Bật lại).

---

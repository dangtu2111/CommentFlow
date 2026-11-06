## KT-ES — Dừng khẩn cấp tự gửi (EMERGENCY-STOP, FR-073)

Chỉ phần máy (chưa có nút/giao diện, chưa ghi DB): người thử chạy test.
1. `pnpm --filter @flow/ai exec vitest run src/emergency` → 2 file xanh. Kết quả mong đợi: không test đỏ (Owner+Staff Dừng được, Staff không Bật lại được, Dừng hủy hẹn giờ của đúng workspace).

---

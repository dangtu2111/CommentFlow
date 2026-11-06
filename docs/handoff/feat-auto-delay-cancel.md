# Bàn giao `feat-auto-delay-cancel` (agent: claude, làn c)

**Đã làm:** plan + Q-ADC1; `packages/ai/src/delay/` (máy trạng thái thuần + `AutoSendDelayScheduler` bộ nhớ) với test ví dụ + property-based; export ở `packages/ai/src/index.ts`; gap matrix/MASTER/codemap/KT-ADC.

**Đã đọc + rút ra:** `DELAY_SECONDS_OPTIONS` = {0,60,120,300} ở `automation/settings.ts`; `docs/09` §6.1: hủy trong khoảng trễ + Dừng khẩn cấp hủy job ngay, `sendRecheck` là lớp hai. Worktree có sẵn thay đổi chưa commit ở `packages/db/migrations/0047_*.sql` — KHÔNG phải của việc này, không add.

**Còn lại:** `AUTO-DELAY-WIRE` (bản DB/pg-boss, nút Hủy UI, nối pipeline, test race với DB thật) — cần migration, làn b.

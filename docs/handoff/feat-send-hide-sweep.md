# Handoff `feat-send-hide-sweep` (agent vừa làm: claude, làn b)

## Đã làm
SEND-SWEEP + HIDE-SWEEP: migration 0031 (hàm DEFINER `cf.list_stuck_outbox`, hai chỉ mục), `packages/db/src/stuck-outbox.ts`, `apps/worker/src/jobs/sweep.ts` (+ nối `main.ts`, một sổ connector dùng chung), `checkStuckOutboxFunction` ở `check-rls`, trần `attempts` trong `prepare` của `send`/`hide` (verifier-security), test đơn vị + tích hợp, tài liệu.

## Còn lại
- CHƯA chạy được `CF_LANE=b pnpm test:db` và `pnpm db:check-rls` (môi trường chặn đặt biến `CF_LANE`): chạy ở làn b / CI; `stuck-outbox.int.test.ts` và `sweep.int.test.ts` chưa từng chạy.
- KT-016 (kiểm tay); ngưỡng quét là hằng số trong `sweep.ts`.
- Khi đăng ký connector thật: dùng chung `connectorRegistry` trong `main.ts`.

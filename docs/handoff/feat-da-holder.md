# Handoff `feat-da-holder` (claude, làn c)

## Đã làm
- `packages/ai/src/decide/human-hold-rules.ts`: `evaluateHumanHold` thuần (FR-154, Q-DH1); test + property-based; export ở `decide/index.ts`.
- Docs: plan, `q-dh1.md`, codemap fragment, `kt-dh.md`/`tt-dh.md`, gap-matrix (dòng DA-HOLDER), MASTER.
- Lưu ý: lời giao việc ghi "giữ hàng/đặt cọc" nhưng mã DA-HOLDER = FR-154 người giữ chuỗi; làm theo spec. Phần giữ hàng/đặt cọc ghi gap `DA-DEPOSIT-RULES`.

## Đã đọc và rút ra
- `gate/auto-send-gate.ts` đã có `flags.humanHolding` (cổng 6, lý do `human_holding`); thiếu hàm tính cờ.
- Mẫu hàm thuần: `decide/order-hours-rules.ts`, `handoff-rules.ts`.

## Còn lại
- `DA-HOLDER-WIRE`: pipeline đọc tin nhân viên trong chuỗi + cột `human_hold_minutes` (cần bảng — làn b) → `decideAutoSend.flags.humanHolding`.
- `DA-DEPOSIT-RULES`: quy tắc giữ hàng/đặt cọc → chuyển người (cần xác định spec).

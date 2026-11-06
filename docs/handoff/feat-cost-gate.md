# Bàn giao — nhánh `feat-cost-gate`

Cập nhật: 2026-11-06 · Mục gap matrix: COST-GATE · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-cost-gate.md`

## Đã làm
- `packages/ai/src/cost-gate/`: `evaluateCostGate` (thuần, micro-đô), `estimateCallCostUsd`, sổ đặt chỗ + khóa theo workspace, `createDbCostLedger` (chỉ đọc) + bản bộ nhớ, `createCostGatedLlmClient`; mã lỗi `COST_CAP_REACHED` (402) ở `@flow/shared`; ngưỡng coverage 95 % nhánh cho `src/cost-gate/*.ts`.
- Test: đơn vị + property-based (fast-check) viết trước; `tests/cost-ledger.int.test.ts` (DB thật) **chưa chạy được ở lần làm này** (không kết nối được DB `cf_test` từ phiên làn d).
- Tài liệu: Q-CG1, gap matrix, MASTER, codemap, CAN_BAN_CUNG_CAP 2r, KT-CG.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/ai/src/llm-client.ts` | `ai_usage` ghi TRƯỚC khi `call` trả về → nhả chỗ đặt sau `call` không đếm thiếu |
| `packages/ai/src/gate/auto-send-gate.ts` | Cổng 9 đã có (`aiCostMonthUsd ≥ aiCostCapUsd`); cùng quy tắc, số liệu lấy từ `CostLedger` khi nối |
| `packages/db/src/runtime.ts` | Xuất lại `eq`, `sql` của drizzle (gói ai không phụ thuộc trực tiếp drizzle-orm) |

## Còn lại
1. Chạy `pnpm --filter @flow/ai test:db` (`cost-ledger.int.test.ts`) trên máy có DB.
2. `COST-GATE-WIRE`: bọc `createLlmClient` ở nơi dựng (worker/web), cảnh báo Owner khi `nearCap`.
3. `COST-GATE-PERSIST` (Redis đa tiến trình), `COST-GATE-PLAN-DEFAULT` (cột trần theo gói — migration làn b), ô nhập hạn mức ở `AUTO-SETTINGS-COST`.
4. Đo ≤ $2/1.000 lượt vẫn chờ EVAL-RUNNER.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/cost-gate
pnpm --filter @flow/ai test:coverage
```

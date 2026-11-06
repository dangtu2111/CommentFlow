# Bàn giao — nhánh `feat-da-rules-order-hours`

Cập nhật: 2026-11-06 · Mục gap matrix: DA-RULES-ORDER-HOURS · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-da-rules-order-hours.md`

## Đã làm
- `packages/ai/src/decide/order-hours-rules.ts`: `detectOrderStatusIntent`, `withOrderStatusTopic` (FR-153); `evaluateBusinessHours`, `nextOpening`, `promisesImmediateReply`, `resolveInvitation` (FR-152). Test TDD + property-based (seed 20261106) ở `order-hours-rules.test.ts`. Xuất ở `index.ts`.
- `decideAction` không đổi (nhánh `order_status` đã có từ PIPE-DECIDE-ACTION).
- Q-DROH1, KT-DROH, gap matrix, MASTER, codemap, CAN_BAN_CUNG_CAP.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `gate/auto-send-gate.ts` | `activeHoursSchema`/`isWithinActiveHours`/`localDayMinute` đã export; khung `from>to` là qua đêm, `from=to` rỗng |
| `shared/kb-content.ts` | `handoff_templates` = `{ [shipping|discount|order_status|stock_check|other]: { inHours, outHours } }` |
| `decide/decide-action.ts` | `redirectTemplates` dùng khóa trên; `handoff` có `redirectTemplates=[]` |

## Còn lại (việc khác)
1. `DA-RULES-ORDER-HOURS-WIRE` (làn b): cột/bảng giờ làm việc workspace; nạp mẫu + giờ vào `resolveInvitation`; gọi `withOrderStatusTopic` ở bước tách ý; đưa câu mời vào prompt soạn.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/decide
pnpm --filter @flow/ai test:coverage
```

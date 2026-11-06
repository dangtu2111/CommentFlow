# Bàn giao — nhánh `feat-auto-matrix-ui`

Cập nhật: 2026-11-06 · Mục gap matrix: AUTO-MATRIX-UI · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-auto-matrix-ui.md`

## Đã làm
- Lõi `packages/ai/src/automation/` (schema Zod, `modeFor`, `toGateSettings`, store + bản bộ nhớ) kèm test.
- Trang `/app/automation` (chỉ Owner), Server Action, form thuần, menu, i18n vi/en, test form/dịch vụ/nav.
- Tài liệu: Q-AMU1, KT-AMU, CAN_BAN_CUNG_CAP 2m, gap matrix (`AUTO-MATRIX-UI` xong-mock; `AUTO-MATRIX-DB`, `AUTO-SETTINGS-COST` mở), MASTER, codemap.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/ai/src/gate/auto-send-gate.ts` | `settings` của `decideAutoSend` cần threshold/dailyCap/blockedLabels/blockedKeywords/allowPartial/allowClarify/activeHours; `autoSendPolicy` hợp lệ là `standard`… (không phải `auto`) |

## Còn lại (theo thứ tự)
1. `AUTO-MATRIX-DB` (làn b): migration `cf.automation_settings` + store DB + RLS ghi Owner; đổi `automationSettings()`.
2. Nối `modeFor`/`toGateSettings` vào pipeline (PIPE-ROUTE) và `delaySeconds` vào AUTO-DELAY-CANCEL.
3. `AUTO-SETTINGS-COST`: hạn mức tháng + điều kiện tự tạm dừng.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/automation
pnpm --filter @flow/web exec vitest run src/lib/automation-form.test.ts src/server/automation-settings.test.ts src/lib/app-nav.test.ts
```

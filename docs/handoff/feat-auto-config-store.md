# Bàn giao — nhánh `feat-auto-config-store`

Cập nhật: 2026-11-06 · Mục gap matrix: AUTO-CONFIG-STORE (phần lưu của AUTO-MATRIX-DB) · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-auto-config-store.md`

## Đã làm
- Migration 0047: `cf.automation_settings` (một dòng/workspace) + `cf.automation_rules` (ô ma trận), RLS Owner/hệ thống ghi, CHECK sàn; kỳ vọng ở `check-rls.ts`.
- `queries/automation-settings.ts` (`get`/`save` một giao dịch), `createDbAutomationSettingsStore`, `automationSettings()` đổi sang DB, cảnh báo i18n cập nhật.
- Nhánh này đã **merge `origin/feat-auto-matrix-ui` (PR #105)** để có interface `AutomationSettingsStore`; nếu #105 merge trước thì diff chỉ còn phần của việc này.
- Tài liệu: Q-ACS1, docs/10 (tách hai bảng), gap matrix, MASTER, codemap, CAN_BAN_CUNG_CAP 2q, KT-ACS.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/ai/src/automation/settings.ts` | `AutomationConfig` = `rules[]` + threshold/delay/dailyCap/activeHours/blockedKeywords/signature; Zod `strict` |
| `migrations/0045_post_notes.sql` | Mẫu Owner-ghi: `is_workspace_owner() OR is_system_context()`, đọc `current_user_id() IS NULL OR is_workspace_member()` |
| drizzle `sql` | Mảng JS trong `sql` bị bung thành nhiều tham số → truyền JSON + `jsonb_array_elements` |

## Còn lại
1. Chạy `CF_LANE=b pnpm test:db` + `pnpm db:check-rls` trên máy có DB `cf_test` (lần làm này không chạy được: bị chặn quyền chạy lệnh/không có DB).
2. `AUTO-CONFIG-WIRE`: pipeline đọc cấu hình (`modeFor`/`toGateSettings`), ghi đè theo bài, `delaySeconds`.
3. Ghi `action_logs`; cột `lang`/`allow_partial`/`allow_clarify`.

## Lệnh test liên quan
```
pnpm --filter @flow/web exec vitest run src/server/automation-settings-store.test.ts src/server/automation-settings.test.ts
pnpm --filter @flow/db exec vitest run src/check-rls.test.ts
CF_LANE=b pnpm test:db
```

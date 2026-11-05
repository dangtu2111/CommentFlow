# Bàn giao — nhánh `feat/log-on-behalf-of`

Cập nhật: 2026-11-05 · Mục gap matrix: LOG-STAFF-SYSTEM-ROWS · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-log-on-behalf-of.md`

## Đã làm
- Migration 0029: cột `core.action_logs.on_behalf_of` (không FK, CHECK chỉ `system`), backfill từ `after.requested_by`, policy SELECT (Staff thấy dòng system theo yêu cầu của mình) và INSERT (nhánh user đòi `on_behalf_of IS NULL`).
- `check-rls` (marker `on_behalf_of` cho SELECT/INSERT) + test; `queries/action-logs.ts` (`viewerConditions`, `onBehalfOfId/Name`); worker `send`/`hide` ghi cột; UI `actorDisplay` + `onBehalfOfDisplay`, i18n vi/en; docs 10, 13, codemap, gap-matrix, MASTER, KT-012.
- Test: `packages/db/tests/action-logs-on-behalf.int.test.ts`, `action-logs.int.test.ts`, worker send/hide, `action-log-format.test.ts`, `check-rls.test.ts`.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `0016_owner_only_policies.sql` | Policy INSERT chỉ cho `system`/`ai` khi `current_user_id() IS NULL` → `withActor` không ghi được dòng system. |
| `worker/jobs/send.ts`, `hide.ts` | Mỗi file chỉ có MỘT INSERT `action_logs` (thành công); thất bại không ghi nhật ký. |

## Quyết định đã chốt trong phiên
- Không FK; có backfill; không tạo chỉ mục trong migration (gộp ACTION-LOGS-ACTOR-INDEX).

## Còn lại
- Chủ dự án gọi `verifier-db` + `verifier-security` một lần; tạo PR; chạy KT-012 thủ công.
- Chỉ mục CONCURRENTLY (ACTION-LOGS-ACTOR-INDEX) ở migration riêng.

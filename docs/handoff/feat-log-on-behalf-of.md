# Bàn giao — nhánh `feat/log-on-behalf-of`

Cập nhật: 2026-11-05 · Mục gap matrix: LOG-STAFF-SYSTEM-ROWS · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-log-on-behalf-of.md`

## Đã làm
- Migration 0029: cột `core.action_logs.on_behalf_of` (không FK, CHECK chỉ `system`), backfill từ `after.requested_by`, policy SELECT (Staff thấy dòng system theo yêu cầu của mình) và INSERT (nhánh user đòi `on_behalf_of IS NULL`).
- `check-rls` (marker `on_behalf_of` cho SELECT/INSERT) + test; `queries/action-logs.ts` (`viewerConditions`, `onBehalfOfId/Name`); worker `send`/`hide` ghi cột; UI `actorDisplay` + `onBehalfOfDisplay`, i18n vi/en; docs 10, 13, codemap, gap-matrix, MASTER, KT-013.
- Test: `packages/db/tests/action-logs-on-behalf.int.test.ts`, `action-logs.int.test.ts`, worker send/hide, `action-log-format.test.ts`, `check-rls.test.ts`.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `0016_owner_only_policies.sql` | Policy INSERT chỉ cho `system`/`ai` khi `current_user_id() IS NULL` → `withActor` không ghi được dòng system. |
| `worker/jobs/send.ts`, `hide.ts` | Mỗi file chỉ có MỘT INSERT `action_logs` (thành công); thất bại không ghi nhật ký. |

## Quyết định đã chốt trong phiên
- Không FK; có backfill; không tạo chỉ mục trong migration (gộp ACTION-LOGS-ACTOR-INDEX).

## Sửa sau verifier
- 0029 sửa thẳng file (chưa merge): lock_timeout đầu file, CHECK NOT VALID + VALIDATE, comment đúng; policy INSERT nhánh system/ai siết thành `is_system_context()` (đã kiểm: mọi writer hợp lệ là withJob/withActor/DEFINER-user; test actor-rls cập nhật); check-rls kiểm CHECK + marker `is_system_context`; test mã lỗi cụ thể + test nhánh `on_behalf_of IS NULL` (gỡ CHECK tạm trong giao dịch rồi ROLLBACK, SET LOCAL ROLE cf_app); KT đổi thành KT-013; `requested_by` xác nhận là uuid (0023, 0027).
- Gap mới `ACTION-LOGS-BACKFILL-RERUN`: sau khi worker mới chạy ổn, chạy lại câu backfill một lần.

## Còn lại
- Chủ dự án gọi `verifier-db` + `verifier-security` một lần; tạo PR; chạy KT-013 thủ công.
- Chỉ mục CONCURRENTLY (ACTION-LOGS-ACTOR-INDEX) ở migration riêng.

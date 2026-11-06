# Bàn giao — nhánh `feat-retrieval-log`

Cập nhật: 2026-11-06 · Mục gap matrix: RETRIEVAL-LOG · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-retrieval-log.md`

## Đã làm
- `packages/shared/src/retrieval-log.ts` (+ test): dựng bản ghi nhật ký/gap đã che PII; `KB_GAP_TOPICS` chuyển về shared (`decide-action` re-export).
- Migration 0040: `cf.retrieval_logs` (chỉ INSERT hệ thống), `cf.kb_gaps` (hệ thống ghi đếm, thành viên đổi trạng thái, trigger chặn cột đếm), hàm `cf.purge_expired_retrieval_logs`.
- `packages/db/src/retrieval-logs.ts`: `insertRetrievalLog`, `listRetrievalLogs`, `recordKbGap`, `listKbGaps`, `setKbGapStatus`, `purgeExpiredRetrievalLogs`.
- `check-rls.ts`: policy/NO_DELETE/cột cấm cho hai bảng. Worker `retention.ts`: dọn 90 ngày độc lập với dọn payload webhook.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `0039_usage_counters.sql`, `0036`, `0034` | Mẫu: `SET LOCAL lock_timeout`, policy `(SELECT core.…())`, GRANT theo cột. `cf_worker` kế thừa `cf_app` và KHÔNG được có quyền trực tiếp (check-rls) → quyền ghi hệ thống = policy `is_system_context()` + GRANT cho `cf_app`. |
| `check-rls.ts` | Mỗi bảng mới cần mục ở `ACTOR_POLICIES`, `FORBIDDEN_IN_POLICY`, danh sách cột cấm, `NO_DELETE_TABLES`. |
| Máy làn | Không chạy được `pnpm test:db`/`db:check-rls` (cần phê duyệt + DB); `pnpm --filter <gói> exec vitest` lỗi, dùng `pnpm --filter <gói> test -- <file>`. |

## Còn lại
- `CF_LANE=b pnpm test:db` + `pnpm db:check-rls` chưa chạy ở máy này → xác nhận ở CI (`retrieval-log.int.test.ts` viết trước migration, chưa từng chạy).
- `RETRIEVAL-LOG-WIRE` (PIPE-RETRIEVE/guard gọi `insertRetrievalLog`/`recordKbGap`), `KB-GAPS-UI`, endpoint `/kb/gaps`, `/kb/retrieval-logs`, `REDACT-COPIES-MISSING` theo `comment_id`.

# Bàn giao `feat-action-logs-actor-index` (agent: claude, làn b)

## Đã làm
- Migration `0032_action_logs_actor_index.sql`: 2 chỉ mục một phần cho `core.action_logs` (actor_id/user và on_behalf_of), `SET LOCAL lock_timeout='5s'` + `IF NOT EXISTS`. Không CONCURRENTLY (runner drizzle chạy trong 1 giao dịch) — Q-AI1.
- `schema/core/platform.ts` khai báo 2 chỉ mục (`created_at DESC NULLS FIRST` = mặc định của DESC, để planner dùng được cho `ORDER BY created_at DESC`); snapshot/journal do `drizzle-kit generate` sinh.
- Test DB `action-logs-actor-index.int.test.ts` (kiểm tên, định nghĩa, `indisvalid`).
- Docs: plan, Q-AI1, docs/10, gap-matrix, MASTER, codemap, KT-019.

## File đã đọc + điều rút ra
`packages/db/src/admin.ts` (migrate trong 1 giao dịch), migration 0029 (mẫu `lock_timeout`), `check-migrations.mjs`.

## Chưa làm / còn lại
- Test DB (`CF_LANE=b pnpm test:db`, `db:check-rls`) KHÔNG chạy được trong phiên này (lệnh cần duyệt) → người điều phối chạy trước khi merge.
- Production nếu bảng lớn: tạo tay CONCURRENTLY trước migrate (hướng dẫn đầu file migration).

# Kế hoạch `feat-action-logs-actor-index` — Chỉ mục cho Nhật ký của Staff

## Việc

Mã gap matrix: `ACTION-LOGS-ACTOR-INDEX` · Spec: FR-092 (05), `docs/10` §3.1 (`action_logs`).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Staff chỉ xem được dòng nhật ký của mình và dòng hệ thống do mình yêu cầu, nhưng bảng `action_logs` chỉ có chỉ mục (index — "mục lục" giúp tìm nhanh) theo workspace + thời gian, nên khi bảng lớn các truy vấn này sẽ chậm. Thêm hai chỉ mục một phần (chỉ lập cho các dòng liên quan) khớp đúng điều kiện của truy vấn và policy RLS (chính sách phân quyền theo dòng).
Rủi ro: dựng chỉ mục khóa ghi vào `action_logs` trong lúc chạy; runner không hỗ trợ `CONCURRENTLY` nên dùng `lock_timeout` (xem Q-AI1).

## Điểm chưa rõ

Không có. Quyết định tự chọn: Q-AI1 trong `QUYET_DINH_CHO_DUYET.md`.

## Tiêu chí nghiệm thu

1. Có chỉ mục `core.action_logs_ws_actor_created_idx` `(workspace_id, actor_id, created_at DESC) WHERE actor_type='user'`, hợp lệ (`indisvalid`) — test DB `action-logs-actor-index.int.test.ts`.
2. Có chỉ mục `core.action_logs_ws_on_behalf_created_idx` `(workspace_id, on_behalf_of, created_at DESC) WHERE on_behalf_of IS NOT NULL`, hợp lệ — cùng test.
3. Migration 0031 áp được trên DB đã migrate, chạy lại không lỗi (`IF NOT EXISTS`), có `lock_timeout` và đường lùi ở đầu file — `migrate.int.test.ts` + `pnpm check:migrations`.
4. Schema drizzle khớp migration (không sinh migration mới khi `drizzle-kit generate`) — kiểm tay một lần.
5. Công cụ xanh: lint, typecheck, check:migrations, check:plans, test:trace; `CF_LANE=b pnpm test:db` + `db:check-rls` (chạy bởi người điều phối nếu máy phụ không với tới).

## File sẽ đọc (đã đọc)

`docs/gap-matrix.md` dòng ACTION-LOGS-ACTOR-INDEX, `packages/db/src/admin.ts` (runner), `migrations/0029_*.sql` (đầu file), `schema/core/platform.ts`, `scripts/check-migrations.mjs`.

## File sẽ sửa / tạo

- `packages/db/migrations/0031_action_logs_actor_index.sql` + `meta/0031_snapshot.json`, `_journal.json`; `packages/db/src/schema/core/platform.ts` (khai báo 2 chỉ mục).
- `packages/db/tests/action-logs-actor-index.int.test.ts` (mới).
- Docs: `docs/10` §4 (câu chỉ mục), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md` (KT-016), `docs/handoff/feat-action-logs-actor-index.md`.

## Migration

`0031_action_logs_actor_index.sql` (nhánh duy nhất có migration): `SET LOCAL lock_timeout='5s'` + hai `CREATE INDEX IF NOT EXISTS`. Đường lùi: `DROP INDEX IF EXISTS` hai chỉ mục (không đổi quyền/dữ liệu).

## Test viết trước

`action-logs-actor-index.int.test.ts` (đỏ trước khi có migration).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/action-logs-actor-index.int.test.ts`

## Cần kiểm chứng độc lập không?

Có: migration/index → `verifier-db` một lần. Không đổi RLS/quyền nên không cần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Bảng lớn ở production: tạo tay `CONCURRENTLY` trước khi migrate (hướng dẫn ở đầu file migration).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không đi ngược nguyên tắc nào). Lệch so với gap matrix: không `CONCURRENTLY` — Q-AI1.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

**Đã duyệt** (tự chọn theo AGENTS.md § Quy tắc hỏi; quyết định Q-AI1 trong `QUYET_DINH_CHO_DUYET.md`).

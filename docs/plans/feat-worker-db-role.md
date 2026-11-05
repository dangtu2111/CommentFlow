# Kế hoạch `feat/worker-db-role` — Role DB riêng cho worker

## Việc

Mã gap matrix: `WORKER-DB-ROLE` · Spec: ADR 007 §2 (giới hạn đã biết), ADR 005 §3, ADR 011 (mới), `docs/13` §5 (token).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Hiện web và worker cùng đăng nhập Postgres bằng role `cf_app`, nên nếu web bị chiếm hoàn toàn thì kẻ đó tự đặt "ngữ cảnh hệ thống" và gọi được `cf.read_channel_token` để lấy token Page đã mã hóa. Tạo role `cf_worker` (chỉ worker dùng, mật khẩu riêng): chỉ kết nối bằng role này mới được coi là "hệ thống" (`core.is_system_context()`), và chỉ role này có quyền chạy `read_channel_token`. Rủi ro: role phải có sẵn trước khi migrate (cf_owner không có CREATEROLE) → mọi môi trường (dev, CI, staging) phải chạy bước tạo role trước migration 0030.

## Điểm chưa rõ

Không có. Lựa chọn kỹ thuật (agent chọn, ghi `QUYET_DINH_CHO_DUYET.md` Q3–Q6): `cf_worker` là thành viên của `cf_app` (kế thừa quyền, không nhân đôi GRANT); `is_system_context()` thêm điều kiện `session_user = 'cf_worker'`; `EXECUTE read_channel_token` thu hồi khỏi `cf_app`, cấp riêng `cf_worker`; web KHÔNG nhận `DATABASE_WORKER_URL`; test cũ dùng `withJob` chuyển sang pool `cf_worker` qua helper.

## Tiêu chí nghiệm thu

1. `cf_app` (web) KHÔNG gọi được `cf.read_channel_token` (42501 do thiếu EXECUTE, kể cả khi tự `set_config('app.ctx','system')`) — test `worker-role.int.test.ts`.
2. `cf_app` đặt `app.ctx='system'` vẫn KHÔNG thành hệ thống: `core.is_system_context()` = false; ghi bảng đòi hệ thống (posts/comments INSERT, hàm DEFINER chỉ-hệ thống) bị từ chối — cùng test.
3. Kết nối `cf_worker` + `withJob`: `is_system_context()` = true, `read_channel_token` trả ciphertext, ghi bảng hệ thống được; `cf_worker` KHÔNG có `withJob` giả mạo người dùng (`app.user_id` đặt → không còn hệ thống); `cf_worker` không BYPASSRLS/SUPERUSER/CREATEROLE; `cf_app` không là thành viên `cf_worker`; PUBLIC không EXECUTE — cùng test.
4. `withWorkspace` trần qua `cf_worker` vẫn không phải hệ thống (đòi ctx) — cùng test.
5. Mọi test DB/worker cũ vẫn xanh sau khi `withJob` chạy bằng `cf_worker` (helper) — `pnpm test:db`.
6. Worker đọc `DATABASE_WORKER_URL` (zod, bắt buộc, không còn dùng `DATABASE_URL`); pg-boss cũng dùng URL đó — test `config.test.ts` + test worker int.
7. `pnpm db:check-rls` bắt hồi quy: thân `is_system_context` mất `session_user`, `cf_app` có EXECUTE `read_channel_token`, `cf_worker` thiếu EXECUTE/thừa quyền, `cf_app` là thành viên `cf_worker` — test `check-rls.test.ts` + `check-rls.int.test.ts`.
8. Script `cf-dev-add-worker-role.sh` idempotent, không in mật khẩu (kiểm bằng đọc script + test `cf-dev-command.test.mjs` cho lệnh `add-worker-role`); init script/CI/compose/gen-staging-env/print-dev-env/env mẫu có biến mới; bước staging nằm ở `docs/staging/H5-CHECKLIST.md` + `docs/15` §6 (không chạy lên staging).
9. Công cụ xanh: biome, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test:trace, `pnpm test`, `test:db` phần liên quan.

## File sẽ đọc (đã đọc)

`0020_channel_token_functions.sql`, `packages/db/src/client.ts`, `apps/worker/src/{config,main}.ts`, `infra/postgres/init/10-roles-and-databases.sh`, `infra/scripts/cf-dev-add-auth-role.sh`, `scripts/lib/cf-dev-command.mjs`, `docker-compose*.yml` (đoạn env), `.github/workflows/ci.yml` (đoạn role), test helpers.

## File sẽ sửa / tạo

- `packages/db/migrations/0030_worker_db_role.sql` + `meta/0030_snapshot.json` + `_journal.json`.
- `packages/db/src/check-rls.ts` (+ test, + int test): kiểm quyền/thân hàm/role.
- `packages/db/src/client.ts`: chỉ cập nhật chú thích `withJob`.
- `packages/db/tests/{helpers.ts, worker-role.int.test.ts (mới)}`, `packages/saas-core/tests/helpers.ts`, test cũ có dùng `withJob` (đổi sang helper).
- `apps/worker/src/{config.ts,config.test.ts,main.ts}`; `apps/worker/tests/*` dùng URL worker.
- `infra/postgres/init/10-roles-and-databases.sh`, `infra/scripts/cf-dev-add-worker-role.sh` (mới), `infra/scripts/cf-dev-add-test-db.sh` (CONNECT), `infra/scripts/{print-dev-env,gen-staging-env}.sh`, `scripts/cf-dev-env-init.sh`, `scripts/lib/cf-dev-command.mjs` (+ test), `infra/docker-compose{,.staging}.yml`, `infra/env.cf-dev.example`, `infra/env.cf-staging.example`, `env.example`, `.github/workflows/ci.yml`.
- Docs: ADR 011 (mới), ADR 007 §2 + 008/009 ghi chú, `docs/15` §6, `docs/staging/H5-CHECKLIST.md`, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-worker-db-role.md`.

## Migration

`0030_worker_db_role.sql` (nhánh duy nhất có migration; `SET LOCAL lock_timeout = '5s'` ở đầu file): (1) kiểm role `cf_worker` tồn tại, là thành viên `cf_app`, không BYPASSRLS/SUPERUSER, `cf_app` không thuộc `cf_worker` — thiếu → lỗi hướng dẫn; (2) `GRANT CONNECT` DB hiện tại; (3) `CREATE OR REPLACE core.is_system_context()` thêm `session_user = 'cf_worker'`; (4) `REVOKE EXECUTE read_channel_token FROM cf_app`, `GRANT … TO cf_worker`. Không đổi bảng. Đường lùi: `CREATE OR REPLACE` lại bản 0020 của `is_system_context`; `GRANT EXECUTE read_channel_token TO cf_app`; `REVOKE` của `cf_worker`; role giữ (DROP ROLE bởi superuser).

## Test viết trước

`worker-role.int.test.ts`, `check-rls.test.ts`, `config.test.ts`, `cf-dev-command.test.mjs` — đỏ trước khi có migration/mã.

## Lệnh test phạm vi hẹp

`CF_LANE=b pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/worker-role.int.test.ts`, `pnpm --filter @flow/db exec vitest run src/check-rls.test.ts`, `pnpm --filter @flow/worker exec vitest run src/config.test.ts`, `node --test scripts/lib/cf-dev-command.test.mjs` (hoặc lệnh vitest của repo).

## Cần kiểm chứng độc lập không?

Có: S + DB → `verifier-security` và `verifier-db` (một lần, cuối nhánh).

## Rủi ro / câu hỏi cho chủ dự án

- Role `cf_worker` phải tạo trước migrate ở MỌI môi trường: dev VM (`pnpm cf:dev add-worker-role`), staging (xem H5-CHECKLIST), CI (init script). Worker bản cũ (dùng `cf_app`) chạy sau migrate sẽ mất quyền hệ thống → phải triển khai worker mới cùng lúc.
- Web bị chiếm vẫn tự đặt `app.user_id` (ADR 005 §3) — không đổi; nhưng hết đường hệ thống/đọc token.
- Giới hạn còn lại: ai có mật khẩu `cf_worker` (tiến trình worker) là hệ thống — đúng thiết kế.

## Đề xuất thay đổi

ADR 011; cập nhật câu "Giới hạn đã biết" của ADR 007 §2, ADR 008 §3, ADR 009 (đã xử lý).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới" (không có bảng mới)

## Trạng thái duyệt

**Đã duyệt** (tự chọn theo AGENTS.md § Quy tắc hỏi; quyết định Q3–Q6 trong `QUYET_DINH_CHO_DUYET.md`).

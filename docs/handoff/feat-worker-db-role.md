# Bàn giao `feat/worker-db-role` (claude, làn B)

## Đã làm

- ADR 011 + migration `0030_worker_db_role.sql` (kiểm role `cf_worker`, `GRANT CONNECT`, `is_system_context()` đòi `session_user = 'cf_worker'`, `read_channel_token` chỉ `cf_worker`) + snapshot/journal.
- Worker: `DATABASE_WORKER_URL` (zod, phải là người dùng `cf_worker`) thay `DATABASE_URL` cho cả `withJob` và pg-boss.
- `check-rls` (thân `is_system_context`, EXECUTE `read_channel_token`, thuộc tính/membership `cf_worker`) + test đơn vị + int.
- Test: `packages/db/tests/worker-role.int.test.ts` (mới); helpers `createWebDb/createWorkerDb/createAppDb` (composite: `withJob` qua worker); test worker dùng `TEST_DATABASE_WORKER_URL`; `CF_LANE` đổi cả URL worker.
- Hạ tầng: init script, `cf-dev-add-worker-role.sh` + lệnh `pnpm cf:dev add-worker-role`, `cf-dev-add-test-db.sh`, `print-dev-env.sh`, `gen-staging-env.sh`, `cf-dev-env-init.sh`, compose (dev: biến cho init; staging: chỉ `worker` nhận URL), env mẫu, CI.
- Docs: ADR 007/008/009 ghi chú, `docs/15` §5–§6, `H5-CHECKLIST` (role trên staging), codemap, gap-matrix, MASTER, `KIEM_TRA_TAY` KT-015, `QUYET_DINH_CHO_DUYET` Q3–Q6.

## Đã đọc và rút ra

- `app.ctx` là biến tự do → chặn thật phải ở role đăng nhập (`session_user`); `SET ROLE` không đổi được `session_user`.
- Role phải tạo ngoài migration (cf_owner không CREATEROLE), cùng mẫu `cf_auth` 0010.
- `withSystem` (ngữ cảnh trần) của web (`record_webhook_event`) và worker (dọn payload) không bị ảnh hưởng.

## Chưa chạy được trong phiên này (cần chủ dự án)

- Test DB (`CF_LANE=b pnpm test:db`): lệnh có biến môi trường bị chặn ở phiên không tương tác, và `.env` chưa có `TEST_DATABASE_WORKER_URL` + máy ảo chưa có role `cf_worker`. **Chưa có bằng chứng chạy thật cho migration 0030 và các test int** — chạy KT-015 bước 1–5 trước khi merge.
- Chưa chạy gì lên staging/production.

## Còn lại

- Việc kế tiếp của làn: `ACTION-LOGS-ACTOR-INDEX` — chỉ làm sau khi PR này được chủ dự án merge.
- Staging: tạo role `cf_worker` theo `docs/staging/H5-CHECKLIST.md` trước khi migrate 0030.

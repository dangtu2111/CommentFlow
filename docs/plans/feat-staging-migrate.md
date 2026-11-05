# Kế hoạch `feat/staging-migrate` — CLI migrate + cài hàng đợi riêng cho staging

Mã gap matrix: `STAGING-MIGRATE` (mới; thay một phần `QUEUE-PROD-INSTALL`, mục (2)–(3) của `H5-CHECKLIST`) · Spec: docs/15 §6 (migration chỉ qua CI có duyệt tay).

**Tóm tắt:** Hiện lệnh `pnpm db:migrate` từ chối staging nên staging không có bảng nào. Việc này thêm một lệnh RIÊNG chỉ chạy được khi đủ điều kiện (APP_ENV=staging, máy chủ DB nằm trong danh sách cho phép, gõ đúng mã xác nhận `<tên-db>@<số-migration-cuối>`), không bao giờ chạy với production, có chế độ `--dry-run` chỉ liệt kê. Kèm workflow GitHub tắt mặc định, chạy trên runner tự host sau khi chủ dự án bấm duyệt. Rủi ro: diff đụng đường ghi lên DB thật nên cần verifier-security; không chạy gì lên staging ở nhánh này.

## Điểm chưa rõ

Không có. Quyết định chủ dự án (đã nêu trong yêu cầu): CLI riêng có biến xác nhận + environment `staging-migrate` (Required reviewers) + self-hosted runner `cf-staging`; không Docker trên máy code; `migration-guard` hiện có giữ nguyên.

## Tiêu chí nghiệm thu

1. `pnpm db:migrate` vẫn từ chối `APP_ENV=staging`/`production` (guard cũ không đổi) — kiểm bằng: `migration-guard.test.ts` hiện có, xanh, không sửa.
2. Lệnh staging từ chối: thiếu/sai `APP_ENV`, `production` (cứng, không đường vòng kể cả khi host/xác nhận đúng), host ngoài danh sách hoặc danh sách trống/ký tự đại diện, URL có tham số ghi đè host/db, tên DB chứa `prod`, thiếu hoặc sai mã xác nhận — kiểm bằng: `staging-migrate-guard.test.ts` (hàm thuần, không cần DB).
3. Thông báo lỗi/tóm tắt không chứa URL, mật khẩu, host — kiểm bằng: test kiểm chuỗi đầu ra với mật khẩu giả.
4. `--dry-run` chỉ đọc (giao dịch `READ ONLY`), không tạo schema `drizzle`, không áp migration; liệt kê đúng migration chờ — kiểm bằng: test thuần tính "chờ" + test tích hợp trên `cf_test` (DB sạch → dry-run → vẫn chưa có bảng).
5. Chạy thật: kiểm trạng thái trước/sau, sau khi chạy không còn migration chờ; DB đã áp migration mới hơn mã → từ chối; `current_database()` phải khớp tên đã xác nhận — kiểm bằng: test tích hợp trên `cf_test` (đi qua đúng hàm của CLI staging, KHÔNG chạm staging/production).
6. `queue:install:staging` dùng cùng bộ guard + xác nhận; thiếu xác nhận → từ chối; `--dry-run` không mở kết nối ghi — kiểm bằng: test đơn vị worker.
7. Cả hai CLI không đọc `.env*`, từ chối tham số lạ, fail-closed khi thiếu biến — kiểm bằng: test parse tham số + đọc mã.
8. Workflow `migrate-staging.yml`: chỉ `workflow_dispatch`, nhập `staging`, job `if vars.DEPLOY_STAGING_ENABLED == 'true'` và chỉ trên `main`, environment `staging-migrate`, runner `[self-hosted, linux, cf-staging]`, hai job (dry-run → migrate thật `needs`), action ghim SHA, không bí mật trong file, đầu vào đi qua `env` — kiểm bằng: đọc file + `gitleaks`/CI.
9. Cổng bổ sung sau kiểm chứng: DB thiếu dấu `cf.env=staging` → từ chối kể cả dry-run; `CF_STAGING_DB_NAME` khớp chính xác; `host:cổng` bắt buộc ở cả danh sách và URL; `sslmode` yếu bị từ chối; chỉ chạy trong workflow `migrate-staging.yml@refs/heads/main` trên GitHub Actions; khóa tư vấn mức DB (kết nối riêng, có timeout); đối chiếu hash `drizzle.__drizzle_migrations` (mục bị bỏ sót/dòng lạ → CONFLICT) — kiểm bằng: `staging-migrate-guard.test.ts`, `staging-migrate.int.test.ts`, `install-staging.test.ts`.
10. Workflow: biến bí mật + mã xác nhận chỉ ở `env` của đúng bước ghi; so sánh "staging" chính xác bằng shell; `pnpm install --ignore-scripts` — kiểm bằng: đọc file; đã chạy thử trong worktree sạch.
11. Công cụ xanh: biome, lint:i18n, typecheck, depcruise, check:plans, test, `test:db` phần liên quan — kiểm bằng: chạy từng lệnh.

## File sẽ đọc (đã đọc)

`migration-guard.ts`(+test), `admin.ts`, `cli/migrate.ts`, `apps/worker/src/queue/install.ts`, `cli/queue-install.ts`, `tests/migrate.int.test.ts`, `tests/global-setup.ts`, H5: `deploy-staging.yml`, `docker-compose.staging.yml`, `H5-CHECKLIST.md`; `STAGING_SETUP.md` mục E.

## File sẽ sửa / tạo

- Tạo `packages/db/src/staging-migrate-guard.ts` (+ `.test.ts`): hàm thuần — guard, mã xác nhận, đọc journal, tính migration chờ.
- Tạo `packages/db/src/staging-migrate.ts`: `runStagingMigrate` (kết nối, trước/sau, dry-run, áp migration) nối vào guard.
- Tạo `packages/db/src/cli/migrate-staging.ts`: CLI mỏng; `packages/db/package.json` + `package.json` gốc: script `db:migrate:staging`.
- Sửa `packages/db/src/index.ts`: export mới.
- Sửa `apps/worker/src/queue/install.ts`: tách `performQueueInstall`; thêm `installQueueSchemaStaging`; tạo `apps/worker/src/cli/queue-install-staging.ts`; `apps/worker/package.json`: `queue:install:staging`.
- Tạo `packages/db/tests/staging-migrate.int.test.ts`.
- Tạo `.github/workflows/migrate-staging.yml`.
- Sửa `docs/gap-matrix.md`, `docs/codemap.md`.

## Migration

Không có (không đổi schema).

## Test viết trước

`staging-migrate-guard.test.ts` (đỏ trước khi có mã), rồi test tích hợp và test worker.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run src/staging-migrate-guard.test.ts` · `pnpm --filter @flow/db run test:db -- tests/staging-migrate.int.test.ts` · `pnpm --filter @flow/worker exec vitest run src/queue`.

## Cần kiểm chứng độc lập không?

**Có** — `verifier-security` (đường ghi lên DB staging, guard môi trường, workflow có bí mật môi trường). Chủ dự án chạy sau; agent không tự gọi.

## Rủi ro / câu hỏi cho chủ dự án

- Bí mật `DATABASE_ADMIN_URL` (role `cf_owner`): dự kiến để làm **secret của environment `staging-migrate`** (`STAGING_DATABASE_ADMIN_URL`), chỉ được nhả sau khi người duyệt bấm. Danh sách host cho phép đặt ở variable của environment `CF_STAGING_DB_HOSTS`.
- Hai job (dry-run rồi migrate) cùng environment nên cần duyệt hai lần; đổi lại người duyệt thấy kết quả dry-run trước khi duyệt lần hai.
- Workflow chỉ chạy được từ `main` (tránh nhánh khác sửa guard rồi dùng bí mật). Nên đặt thêm "Deployment branches = main" cho environment.
- `db:check-rls` trên staging chưa nằm trong lệnh này (script hiện chỉ chặn bằng cách tự tin vào `DATABASE_ADMIN_URL`); đề xuất làm ở bước sau.

## Đề xuất thay đổi

- `docs/15` §6: ghi đường migrate staging (CLI riêng + environment `staging-migrate` + mã xác nhận). `STAGING_SETUP.md` mục E (nhánh `docs/staging-setup`): thay tên dự kiến bằng `pnpm db:migrate:staging`, biến `CF_CONFIRM_STAGING_MIGRATE`, `CF_STAGING_DB_HOSTS`. Không tự sửa.

## Complexity tracking

Không có (không thêm thư viện; tách hàm `performQueueInstall` vì có 2 nơi dùng thật).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (quyết định chủ dự án trong yêu cầu giao việc).

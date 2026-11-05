# Checklist H5 — chuẩn bị staging (phần không cần tên miền)

Trạng thái: **khung đã viết, CHƯA chạy ở đâu**. Nhánh `chore/h5-staging-prep`. Plan: `docs/plans/chore-h5-staging-prep.md`.

## Đã có trong repo

- `apps/web/Dockerfile`, `apps/worker/Dockerfile`, `.dockerignore` (build từ GỐC repo, chạy user `node`, health check).
- `infra/docker-compose.staging.yml` (web, worker, khung `cloudflared` profile `tunnel`) + `infra/env.cf-staging.example` (chỉ tên biến).
- `.github/workflows/deploy-staging.yml` — tắt mặc định. Job `e2e` trong `ci.yml` (Postgres + Valkey + Mailpit + Chromium).

## Triển khai (làm trên máy ảo, theo thứ tự; mục có dấu ⛔ chưa làm được)

1. ⛔ Tạo `.env.cf-staging` trên máy ảo từ `infra/env.cf-staging.example` (secret sinh ngẫu nhiên; `BETTER_AUTH_SECRET`, `TOKEN_ENC_KEYS`).
2. ⛔ Migration lên staging: `pnpm db:migrate` (đến migration mới nhất, gồm 0026 dấu xóa + 0027 hide) và `pnpm db:check-rls`. LƯU Ý: CLI hiện **từ chối `APP_ENV=staging`** (`migration-guard`); cần quyết định đường chạy có duyệt (xem plan, mục "Điểm chưa rõ").
3. ⛔ Cài hàng đợi: `pnpm --filter @flow/worker queue:install` — phải tạo đủ hàng đợi `ingest`, `send`, `hide` (và `system.ping`); cùng vấn đề guard như mục 2.
4. Chạy worker, rồi web (`docker compose ... up -d --wait`). Health: web `/api/health`, worker `/health` (cổng 3001, chỉ trong mạng Compose).
5. **Kiểm worker dọn payload webhook 14 ngày đang chạy** (`WEBHOOK-PAYLOAD-RETENTION`): log worker có dòng "đã dọn payload" sau khi khởi động (job chạy lúc khởi động rồi mỗi giờ).
6. Web KHÔNG publish cổng: `docker compose ps` không có cổng publish của `web`; truy cập chỉ qua `cloudflared`.
7. ⛔ Khi có tên miền: tạo Cloudflare Tunnel, đặt `CLOUDFLARE_TUNNEL_TOKEN`, bật `--profile tunnel`, rồi mới đặt `CLIENT_IP_SOURCE=cf-connecting-ip` + `BETTER_AUTH_URL` thật.
8. ✅ code / ⛔ chạy: `WORKER-DB-ROLE` (ADR 011, migration 0030) — role `cf_worker` PHẢI có TRƯỚC `db:migrate` (migration kiểm và dừng nếu thiếu). Xem mục "Role cf_worker trên staging" bên dưới. Web không được nhận `CF_WORKER_PASSWORD`/`DATABASE_WORKER_URL`.

## Role cf_worker trên staging (làm TRƯỚC migration 0030; chỉ chủ dự án, chưa chạy)

- **Volume Postgres staging MỚI:** script khởi tạo (`infra/postgres/init/10-roles-and-databases.sh`) tự tạo `cf_worker` nếu `.env.cf-staging` có `CF_WORKER_PASSWORD` (do `infra/scripts/gen-staging-env.sh` sinh; thêm tay bằng `openssl rand -hex 24` nếu file env đã có từ trước).
- **Volume ĐÃ có** (script khởi tạo không chạy lại): trên máy ảo, trong thư mục repo, với `CF_WORKER_PASSWORD` (chỉ chữ/số/`_`/`-`) đã nằm trong `.env.cf-staging`; mật khẩu đi qua biến môi trường của container, không vào `ps`:
  ```
  docker compose -p cf-staging --env-file .env.cf-staging -f infra/docker-compose.yml -f infra/docker-compose.staging.yml exec -T -e CF_WORKER_PASSWORD postgres sh -c '
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
  SET log_statement = '"'"'none'"'"';
  CREATE ROLE cf_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '"'"'$CF_WORKER_PASSWORD'"'"';
  GRANT cf_app TO cf_worker;
  GRANT CONNECT ON DATABASE commentflow TO cf_worker;
  SQL'
  ```
  (đã có role từ trước → `ALTER ROLE … PASSWORD` thay cho `CREATE ROLE`). Tên DB theo `CF_APP_DATABASE`.
- Kiểm (không in mật khẩu): `SELECT rolcanlogin, rolsuper, rolbypassrls, pg_has_role('cf_worker','cf_app','usage'), pg_has_role('cf_app','cf_worker','member') FROM pg_roles WHERE rolname='cf_worker';` → `t,f,f,t,f`.
- Thứ tự: tạo role → `migrate-staging.yml` (0030) → `pnpm db:check-rls` → bật worker MỚI (`DATABASE_WORKER_URL` do compose gắn) → web. Worker bản cũ (dùng `cf_app`) KHÔNG chạy được sau 0030 (mất quyền hệ thống).
- Kiểm sau triển khai: log worker không lỗi `42501`; trong DB `SELECT has_function_privilege('cf_app','cf.read_channel_token(uuid)','execute')` → `f`.

## Bật workflow deploy-staging

Cần: (a) máy ảo có runner tự host gắn nhãn `self-hosted, linux, cf-staging`; (b) GitHub Environment `staging` với **Required reviewers**; (c) Repository variable `STAGING_ENV_FILE` (đường dẫn file `.env.cf-staging` trên runner) và `DEPLOY_STAGING_ENABLED=true`; (d) chạy tay: Actions → Deploy staging → nhập `staging`. Tắt lại: xóa hoặc đặt `DEPLOY_STAGING_ENABLED` khác `true`. Workflow không chứa bí mật.

## Chưa kiểm được trên máy code (không dùng Docker ở máy code)

`docker build` hai Dockerfile, `docker compose up`, thử `cloudflared` — chỉ chạy trên máy ảo (ghi kết quả ở báo cáo nhánh).

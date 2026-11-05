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
8. `WORKER-DB-ROLE` (role DB riêng cho worker) — bắt buộc trước staging theo MASTER; hiện cả web và worker dùng `cf_app`.

## Bật workflow deploy-staging

Cần: (a) máy ảo có runner tự host gắn nhãn `self-hosted, linux, cf-staging`; (b) GitHub Environment `staging` với **Required reviewers**; (c) Repository variable `STAGING_ENV_FILE` (đường dẫn file `.env.cf-staging` trên runner) và `DEPLOY_STAGING_ENABLED=true`; (d) chạy tay: Actions → Deploy staging → nhập `staging`. Tắt lại: xóa hoặc đặt `DEPLOY_STAGING_ENABLED` khác `true`. Workflow không chứa bí mật.

## Chưa kiểm được trên máy code (không dùng Docker ở máy code)

`docker build` hai Dockerfile, `docker compose up`, thử `cloudflared` — chỉ chạy trên máy ảo (ghi kết quả ở báo cáo nhánh).

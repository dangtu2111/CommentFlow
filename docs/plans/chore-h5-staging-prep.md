# Kế hoạch `chore/h5-staging-prep` — H5: chuẩn bị staging (phần không cần tên miền)

> Trạng thái duyệt: **Đã duyệt** (chủ dự án 05/11/2026: làm phần H5 không cần tên miền; quyết định nằm trong docs/15, ADR 001 (Valkey), ADR 004).

## Việc

Mã gap matrix: `H5`, `STAGING-DEPLOY` (phần Dockerfile/compose/workflow), `E2E-CI` · Spec: docs/15 §2, §5, §6.

**Tóm tắt:** Viết sẵn Dockerfile cho web và worker, compose `cf-staging` (web không mở cổng ra ngoài, chừa chỗ cloudflared), workflow deploy staging ở trạng thái TẮT, và thêm job E2E vào CI. Không chạy gì lên máy ảo/staging. Rủi ro: Dockerfile/compose không build được trên máy code (không dùng Docker ở đây) nên chỉ kiểm trên máy ảo; migration lên staging bị guard chặn nên chưa có trong deploy.

## Điểm chưa rõ

Không có thẻ chặn nhánh này. Câu hỏi cho chủ dự án (làm ở nhánh sau): đường chạy migration + `queue:install` lên staging — CLI hiện từ chối `APP_ENV=staging`; sửa guard là diff nhạy cảm cần verifier. Khuyến nghị: CLI riêng có biến xác nhận + environment `staging-migrate` có Required reviewers. Vì vậy deploy-staging chưa có bước migration (phần đó không làm ở nhánh này).

## Tiêu chí nghiệm thu

1. Hai Dockerfile + compose staging + workflow có mặt; không dịch vụ nào có `ports:` — kiểm bằng: `docker compose config` trên máy ảo.
2. Image web/worker build được, chạy user thường, health check xanh — kiểm bằng: `docker build` và chạy thử trên máy ảo (project khác cf-dev).
3. Workflow deploy-staging không tự chạy: chỉ `workflow_dispatch`, job có `if` theo biến tắt mặc định, không chứa bí mật — kiểm bằng: đọc file và gitleaks xanh.
4. Job CI `e2e` xanh thật trên PR (Postgres + Valkey + Mailpit + Chromium), có artifact báo cáo khi lỗi — kiểm bằng: `gh pr checks`.
5. Mọi công cụ xanh (lint, i18n, typecheck, test, depcruise, check:plans, check:migrations, build) — kiểm bằng: chạy lệnh.
6. Checklist H5 ghi đủ migration, queue:install (ingest, send, hide), worker dọn payload 14 ngày — kiểm bằng: đọc `docs/staging/H5-CHECKLIST.md`.

## File sẽ đọc (≤ ~8, kèm lý do)

`ci.yml`, `infra/docker-compose*.yml`, `scripts/e2e.mjs`, `scripts/lib/e2e-env.mjs`, `apps/web/next.config.ts`, `apps/web/src/server/env.ts`, `apps/worker/src/{config,main}.ts`.

## File sẽ sửa / tạo

`apps/web/Dockerfile`, `apps/worker/Dockerfile`, `.dockerignore`, `infra/docker-compose.staging.yml`, `infra/env.cf-staging.example`, `.github/workflows/deploy-staging.yml`, `.github/workflows/ci.yml` (job e2e), `docs/staging/H5-CHECKLIST.md`, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc. Kiểm bằng công cụ: compose config, E2E CI, gitleaks.

## Lệnh test phạm vi hẹp

Trên máy ảo: `docker compose -p cf-staging-t --env-file <file giả> -f infra/docker-compose.yml -f infra/docker-compose.staging.yml config`; `docker build -f apps/web/Dockerfile .`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/migration; chỉ hạ tầng chưa bật).

## Rủi ro / câu hỏi cho chủ dự án

Image `node:24-bookworm-slim` và `cloudflare/cloudflared:2025.11.1` chưa ghim digest — ghim khi bật staging thật. Compose nền kéo cả Langfuse/LiteLLM (đúng docs/15, cần RAM máy ảo).

## Đề xuất thay đổi

Thêm đường migration có duyệt cho staging (xem "Điểm chưa rõ").

## Complexity tracking

Không thêm thư viện. Action mới `actions/upload-artifact` (MIT) ghim SHA. Image `axllent/mailpit` (MIT, đã dùng ở cf-dev) thêm vào CI. Không vi phạm nguyên tắc nào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt.**

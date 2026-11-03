# Bản đồ source (codemap)

> Lập **một lần** ở GĐ0 (lệnh `/codemap-init`), sau đó chỉ sửa dòng liên quan trong cùng commit thay đổi code. Mục đích: Claude đọc file này thay vì quét lại repo. Giữ dưới ~150 dòng; mỗi dòng một file/thư mục quan trọng.

Cập nhật lần cuối: 2026-11-03 · commit: 041d076 (nhánh `chore/scaffold`) · Gói nội bộ: `@flow/*` (dùng thẳng mã nguồn TS, không build riêng; Node 24, pnpm, TypeScript 6.0.3)

## Lệnh & công cụ

| Việc | Lệnh | Ghi chú |
|---|---|---|
| Cài đặt | `corepack enable && pnpm install --frozen-lockfile` | Node 24 (`.nvmrc`) |
| Lint + format | `pnpm lint` (Biome) · `pnpm lint:i18n` (ESLint một luật, chỉ `apps/web`) | Biome bỏ qua `docs/`, `*.md` |
| Typecheck / test đơn vị / build | `pnpm typecheck` · `pnpm test` · `pnpm build` | test đơn vị **không cần** máy ảo |
| Ranh giới gói | `pnpm depcruise` | luật ở `.dependency-cruiser.cjs`, test luật ở `tools/boundaries` |
| Test tích hợp (DB thật `cf_test`) | `pnpm test:db` | cần `.env` + máy phụ bật; tự tạo lại schema mỗi lần |
| Migration / kiểm RLS | `pnpm db:migrate` · `pnpm db:check-rls` | chỉ DB `cf_dev`/`cf_test`/`cf_ci`, `APP_ENV` dev/test/ci |
| Cài hàng đợi pg-boss | `pnpm --filter @flow/worker queue:install` | chạy bằng `cf_owner`; worker chạy bằng `cf_app` |
| Máy ảo `cf-dev` | `pnpm cf:dev <up\|ps\|logs\|stats\|sync\|env-init…>` · `pnpm stack:check` | chỉ project `cf-dev`; 7 cổng (có Mailpit 1025/8025); xem `scripts/lib/cf-dev-command.mjs` |
| Python (ml) | `cd services/ml && uv run pytest` · `uv run ruff check .` | |

## Cây thư mục (3 tầng, rút gọn)

| Đường dẫn | Vai trò |
|---|---|
| `apps/web/` | Next.js 16 + next-intl (ngôn ngữ lưu cookie), `/api/health`, chọn ngôn ngữ |
| `apps/worker/` | Worker pg-boss + `/health`; `src/jobs`, `src/queue`, `src/cli` |
| `services/ml/` | FastAPI chỉ `/health` (chưa nạp model) |
| `packages/shared/` | `AppError`, `parseEnv`, `maskPii`/`MaskedText`, locale + chuỗi vi/en (gói lá) |
| `packages/db/` | Drizzle schema `core`/`cf`, `migrations/*.sql`, RLS, `createDb`, `check-rls`, CLI |
| `packages/saas-core/` | `auth` (Better Auth), `tenancy`, `flags` — không biết gì về sản phẩm |
| `packages/ai/` | `createLlmClient().call()` → LiteLLM + ghi `ai_usage` (chưa có pipeline) |
| `infra/` | Compose (`docker-compose.yml` nền + `.dev.yml`), `postgres/init`, `litellm/config.yaml`, `scripts/print-dev-env.sh` |
| `scripts/`, `tools/boundaries/` | Script vận hành (`cf-dev*`, `stack-check`) và test luật depcruise |
| `env.example`, `infra/env.cf-dev.example` | Tên biến `.env` (máy code) và `.env.cf-dev` (máy ảo); không có giá trị thật |

## Bản đồ theo miền

| Miền | Đường dẫn | Vai trò (1 dòng) | Spec liên quan |
|---|---|---|---|
| Auth / phiên | `packages/saas-core/src/auth/` | Better Auth (adapter dùng `db.auth`): argon2id, phiên 14 ngày, cookie ký HMAC; hạn 8 giờ phiên Admin ép bằng trigger DB, `readSession` là lớp thứ hai | 13 §2 · ADR 003 |
| Workspace / thành viên | `packages/saas-core/src/tenancy/` | Tạo workspace (owner), thêm thành viên (chỉ owner), liệt kê workspace của người dùng | 09 §3.1 |
| Feature flag | `packages/saas-core/src/flags/` | `evaluateFlag` thuần + `createFlags` (cache 30 giây, `NOTIFY flags_changed`) | 09 §10 |
| DB client / migrations / RLS | `packages/db/` | `withWorkspace`/`withUser`/`withSystem`, policy RLS (migration 0001, 0004), `checkRls` | 10 §4 |
| Hàng đợi | `apps/worker/src/{queue,jobs}/` | pg-boss: `installQueueSchema`, `createBoss`, `workspaceJob`/`systemJob` | 09 §9 |
| Webhook Meta | Chưa có | | 12 §1 · 11 §13 |
| Gửi trả lời / ẩn | Chưa có | | 09 §6.1 |
| Pipeline AI / prompt | Chưa có | | 09 §4 |
| Gọi LLM (chỗ ghi `ai_usage`) | `packages/ai/src/llm-client.ts` | Một cổng duy nhất tới LiteLLM; kiểu `MaskedText` bắt buộc che PII | FR-034 |
| Cơ sở kiến thức | Chưa có | | FR-E |
| Shopify | Chưa có | | 12 §4 |
| Trang Bình luận (UI) | Chưa có | | UI prompt 7.1 |
| Thanh toán / gói | Chưa có | | 10 §3.6 |
| Admin | Chưa có (có cột `is_admin`, phiên Admin 8 giờ) | | Admin prompt |
| i18n | `packages/shared/src/i18n/`, `apps/web/src/i18n/` | Chuỗi `vi.json`/`en.json`, test khớp khóa, cookie `NEXT_LOCALE` | 08 §8 |
| Test | `*.test.ts` cạnh mã (đơn vị) · `tests/*.int.test.ts` (tích hợp) | Vitest; pytest cho `ml` | 14 |

## Điểm vào quan trọng

| Việc | Hàm | Vị trí |
|---|---|---|
| Kết nối DB / mở giao dịch có ngữ cảnh | `createDb` · `withWorkspace` | `packages/db/src/client.ts:78` · `:81` |
| Chặn migration nhầm môi trường | `assertMigrationAllowed` | `packages/db/src/migration-guard.ts:41` |
| Kiểm RLS | `checkRls` | `packages/db/src/check-rls.ts:33` |
| Tạo cấu hình xác thực | `createAuth` | `packages/saas-core/src/auth/auth.ts:40` |
| Đọc phiên (cách duy nhất được hỗ trợ) | `readSession` | `packages/saas-core/src/auth/session.ts:11` |
| Tạo workspace / thêm thành viên | `createTenancy` → `createWorkspace`, `addMember` | `packages/saas-core/src/tenancy/tenancy.ts:30,47,60` |
| Hỏi flag | `createFlags` → `isEnabled` | `packages/saas-core/src/flags/flags.ts:37` |
| Gọi LLM + ghi `ai_usage` | `createLlmClient` → `call` | `packages/ai/src/llm-client.ts:101` |
| Chạy job theo workspace / hệ thống | `workspaceJob` · `systemJob` | `apps/worker/src/jobs/run-job.ts:33` · `:48` |
| Đăng ký handler hàng đợi | `boss.work(...)` | `apps/worker/src/main.ts:22` |
| Nhận webhook / gửi trả lời bình luận | Chưa có | |

## Bẫy đã biết

- **Ngữ cảnh RLS** do `set_config(..., true)` đặt trong giao dịch; sau khi giao dịch kết thúc biến về `''` (không phải NULL) → hàm `core.current_workspace_id()` dùng `NULLIF`. `withWorkspace` không cho `tx.transaction()` lồng.
- **Liệt kê workspace của tôi** chỉ qua `withUser` (không có ngữ cảnh workspace); trong `withWorkspace(A)` không bao giờ thấy workspace khác.
- **Bảng xác thực** (`users`, `sessions`, `accounts`, `verifications`) chỉ thấy được trong ngữ cảnh `app.ctx = 'auth'` (`db.withAuthContext`, hoặc `db.auth` cho adapter Better Auth); `db.system`/`withSystem` không thấy dòng nào. `withUser` → dòng của mình; `withWorkspace` → không thấy sessions/accounts, `users` chỉ thành viên `active`.
- **Phiên Admin:** trigger `core.cap_admin_session` ép hạn 8 giờ; `cf_app` không UPDATE `is_admin_session`/`created_at`. Gieo dữ liệu thử cho các cột đó phải dùng pool chủ sở hữu (`TEST_DATABASE_ADMIN_URL`).
- **`cf_app` không có DELETE trên `workspaces`/`users`**, không UPDATE `users.is_admin/admin_role`; `action_logs`/`ai_usage` chỉ thêm. Bảng mới phải khai báo quyền + policy (`check-rls` sẽ đỏ nếu thiếu).
- **Token phiên lưu thô** (Better Auth, ADR 003); cookie ký bằng `BETTER_AUTH_SECRET`. Luôn đọc phiên bằng `readSession`; tạo phiên Admin bằng `internalAdapter.createSession(userId, false, { isAdminSession: true }, true)` (tham số cuối `true` bắt buộc, nếu không bị ghi đè mặc định).
- **Flag `kill_switch`:** `default_on = true` = được phép chạy, `false` = đang chặn; đang chặn thì override bật KHÔNG bật lại được (override tắt vẫn có hiệu lực). Thứ tự: kill_switch → override → plan → rollout → default_on.
- **Thành viên bị gỡ** = `members.status = 'removed'`, giữ dòng (`cf_app` không DELETE); `tenancy` chỉ tính thành viên `active`.
- **Drizzle phải là một bản duy nhất:** gói khác lấy toán tử (`eq`, `and`…) từ `@flow/db`, không import `drizzle-orm` trực tiếp (hai bản làm kiểu không khớp).
- **Test tích hợp cần máy phụ bật** và `.env` do chủ dự án sinh bằng `infra/scripts/print-dev-env.sh`; agent không chạy script đó.
- **Healthcheck container** phải gọi qua `$HOSTNAME`/IP container (SeaweedFS, Langfuse không nghe `localhost`).
- **Không đọc `node_modules`** của dự án (bị chặn); muốn xem mã thư viện thì `npm pack` vào thư mục tạm.
- **Biome** tự định dạng cả `*.yml`/`*.json`; chạy `pnpm exec biome check --write .` trước khi commit.

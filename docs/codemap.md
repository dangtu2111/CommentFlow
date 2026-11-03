# Bản đồ source (codemap)

> Lập **một lần** ở GĐ0 (lệnh `/codemap-init`), sau đó chỉ sửa dòng liên quan trong cùng commit thay đổi code. Mục đích: Claude đọc file này thay vì quét lại repo. Giữ dưới ~150 dòng; mỗi dòng một file/thư mục quan trọng.

Cập nhật lần cuối: 2026-11-03 · nhánh `feat/auth-ui` · Gói nội bộ: `@flow/*` (dùng thẳng mã nguồn TS, không build riêng; Node 24, pnpm, TypeScript 6.0.3)

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
| `apps/web/` | Next.js 16 + next-intl (cookie `NEXT_LOCALE`, mặc định theo Accept-Language): trang xác thực `app/(auth)/`, `/app` tạm, `server/` (gốc lắp ráp auth), `components/{ui,auth}`, `styles/tokens.css`, `/api/health` |
| `apps/worker/` | Worker pg-boss + `/health`; `src/jobs`, `src/queue`, `src/cli` |
| `services/ml/` | FastAPI chỉ `/health` (chưa nạp model) |
| `packages/shared/` | `AppError`, `parseEnv`, `maskPii`/`MaskedText`, locale + chuỗi vi/en (gói lá) |
| `packages/db/` | Drizzle schema `core`/`cf`, `migrations/*.sql`, RLS, `createDb`, `check-rls`, CLI |
| `packages/saas-core/` | `auth` (Better Auth + `flows`), `notify` (gửi thư), `tenancy`, `flags` — không biết gì về sản phẩm |
| `packages/ai/` | `createLlmClient().call()` → LiteLLM + ghi `ai_usage` (chưa có pipeline) |
| `infra/` | Compose (`docker-compose.yml` nền + `.dev.yml`), `postgres/init`, `litellm/config.yaml`, `scripts/print-dev-env.sh` |
| `scripts/`, `tools/boundaries/` | Script vận hành (`cf-dev*`, `stack-check`) và test luật depcruise |
| `env.example`, `infra/env.cf-dev.example` | Tên biến `.env` (máy code) và `.env.cf-dev` (máy ảo); không có giá trị thật |

## Bản đồ theo miền

| Miền | Đường dẫn | Vai trò (1 dòng) | Spec liên quan |
|---|---|---|---|
| Auth / phiên | `packages/saas-core/src/auth/` | Better Auth (adapter dùng pool role `cf_auth` từ `openAuthDb`): argon2id, phiên 14 ngày, cookie ký HMAC; hạn 8 giờ phiên Admin ép bằng trigger DB, `readSession` là lớp thứ hai | 13 §2 · ADR 003 |
| Mật khẩu lộ / phổ biến | `packages/saas-core/src/auth/password-policy.ts` | `createPasswordPolicy`: danh sách cục bộ + HIBP k-anonymity (cho qua + log khi lỗi); `createAuthFlows` BẮT BUỘC có `passwordPolicy` (đăng ký, đặt lại) | 13 §2 · ADR 004 §3 |
| Rate limit | `packages/saas-core/src/ratelimit/` | Bộ giới hạn theo cửa sổ cố định: khóa `sys:rl:<hành động>:<xô>:<HMAC>` (không email/IP thô), kho Valkey (`ioredis`, script Lua nguyên tử) + dự phòng bộ nhớ; đăng nhập/2FA dự phòng bộ nhớ, đăng ký/quên/gửi lại thì từ chối khi Valkey sập (ADR 004) | 13 §2 |
| Gửi thư (notify) | `packages/saas-core/src/notify/` | `MailTransport` (SMTP bằng nodemailer; bộ nhớ cho test), mẫu thư vi/en (xác minh, đặt lại, đã có tài khoản), gửi nền không chờ | FR-119 · 08 §6 |
| 2FA + phiên của mình | `packages/saas-core/src/auth/two-factor.ts` (+ `pending.ts`, `ua.ts`), `apps/web/src/app/app/security/`, `app/(auth)/login/2fa/`, `app/app/(guarded)/layout.tsx`, `components/{auth/two-factor-form,security/two-factor-card}.tsx` | `createTwoFactorFlows` (bật/xác nhận/tắt/tạo lại mã, nhập mã khi đăng nhập, `overview`, `posture`, `revokeSession`); cookie ký `cf-2fa-pending` để đếm rate limit đúng người; `requiresTwoFactor` (Owner/`is_admin`); cổng `(guarded)` chuyển về `/app/security`; `apps/web/src/server/request-context.ts` (làm sạch header IP cho MỌI Server Action); bảng `core.two_factors` (chỉ `cf_auth`, UPDATE theo cột — 0014) | 13 §2 · ADR 004 §4 |
| Giao diện xác thực (web) | `apps/web/src/app/(auth)/` + `components/auth/` | Đăng ký, kiểm tra/xác minh email, đăng nhập, quên/đặt lại mật khẩu; Server Action ở `(auth)/actions.ts`; `/app` tạm + đăng xuất; chỉ 2 đường GET `/api/auth/*` mở (`lib/auth-route-guard.ts`) | 08 §6, §8 · 13 §2 |
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
| Kết nối DB / mở giao dịch có ngữ cảnh | `createDb` · `withWorkspace` | `packages/db/src/client.ts:93` · `:96` |
| Pool role `cf_auth` cho bảng xác thực (chỉ module auth import) | `createAuthDb` · `openAuthDb` | `packages/db/src/auth-db.ts:24` · `packages/saas-core/src/auth/auth-db.ts:9` |
| Chặn migration nhầm môi trường | `assertMigrationAllowed` | `packages/db/src/migration-guard.ts:41` |
| Kiểm RLS | `checkRls` | `packages/db/src/check-rls.ts:204` |
| Luồng đăng ký/đăng nhập/quên mật khẩu (kết quả trung tính) | `createAuthFlows` | `packages/saas-core/src/auth/flows.ts:76` |
| Gửi thư theo ngôn ngữ người nhận | `createNotifier` · `createSmtpTransport` · `renderEmail` | `packages/saas-core/src/notify/notifier.ts:17` · `smtp.ts:36` · `templates.ts:106` |
| Gốc lắp ráp auth của web (lazy) | `getAuthRuntime` | `apps/web/src/server/auth.ts:50` |
| Tạo cấu hình xác thực | `createAuth` | `packages/saas-core/src/auth/auth.ts:45` |
| Đọc phiên (cách duy nhất được hỗ trợ) | `readSession` | `packages/saas-core/src/auth/session.ts:12` |
| Tạo workspace / thêm thành viên | `createTenancy` → `createWorkspace`, `addMember` | `packages/saas-core/src/tenancy/tenancy.ts:30,47,60` |
| Hỏi flag | `createFlags` → `isEnabled` | `packages/saas-core/src/flags/flags.ts:37` |
| Gọi LLM + ghi `ai_usage` | `createLlmClient` → `call` | `packages/ai/src/llm-client.ts:101` |
| Chạy job theo workspace / hệ thống | `workspaceJob` · `systemJob` | `apps/worker/src/jobs/run-job.ts:33` · `:48` |
| Đăng ký handler hàng đợi | `boss.work(...)` | `apps/worker/src/main.ts:22` |
| Nhận webhook / gửi trả lời bình luận | Chưa có | |

## Bẫy đã biết

- **Ngữ cảnh RLS** do `set_config(..., true)` đặt trong giao dịch; sau khi giao dịch kết thúc biến về `''` (không phải NULL) → hàm `core.current_workspace_id()` dùng `NULLIF`. `withWorkspace` không cho `tx.transaction()` lồng.
- **Liệt kê workspace của tôi** chỉ qua `withUser` (không có ngữ cảnh workspace); trong `withWorkspace(A)` không bao giờ thấy workspace khác.
- **Bảng xác thực** (`users`, `sessions`, `accounts`, `verifications`) chỉ thấy toàn bộ qua pool role `cf_auth` + `app.ctx = 'auth'` (`openAuthDb` — chỉ module `saas-core/src/auth` được import `@flow/db/auth-db`, luật depcruise `chi-auth-import-auth-db`). `cf_app`: `withUser` chỉ ĐỌC dòng của mình (không cột token/mật khẩu) và chỉ ghi `users.name/image/locale`; `withWorkspace` không thấy sessions/accounts, `users` chỉ thành viên `active`; `verifications` không có quyền. Role `cf_auth` tạo bởi script khởi tạo Postgres (volume mới) hoặc `pnpm cf:dev add-auth-role` (volume cũ); migration 0010 báo lỗi nếu thiếu role.
- **Phiên Admin:** trigger `core.cap_admin_session` ép hạn 8 giờ (INSERT + UPDATE), chỉ user `is_admin` mới có phiên Admin; `cf_app` không UPDATE `sessions`. Gieo dữ liệu thử cho các cột đó và tạo người dùng thử phải dùng pool chủ sở hữu (`TEST_DATABASE_ADMIN_URL`); test cần pool xác thực dùng `TEST_DATABASE_AUTH_URL`.
- **`cf_app` không có DELETE trên `workspaces`/`users`**, không UPDATE `users.is_admin/admin_role`; `action_logs`/`ai_usage` chỉ thêm. Bảng mới phải khai báo quyền + policy (`check-rls` sẽ đỏ nếu thiếu).
- **`@flow/db` có hai cửa:** `@flow/db/runtime` (truy vấn, `createDb`, schema — dùng trong web/worker/saas-core) và `@flow/db` (thêm `runMigrations`, `checkRls`... cho CLI/test). Web/saas-core KHÔNG import `@flow/db` gốc: mã migration kéo vào bundle Next và làm build lỗi.
- **Rate limit & IP (ADR 004):** `createAuthFlows` BẮT BUỘC có `limiter` (không có mặc định "cho qua"). Ở dev Next KHÔNG cho IP kết nối đáng tin (tự đặt `X-Forwarded-For` nhưng giữ nguyên giá trị client tự đặt) nên `CLIENT_IP_SOURCE=none` → chỉ xô theo email, mọi header IP của client bị xóa trước khi gửi cho Better Auth; `cf-connecting-ip` chỉ hợp lệ khi `APP_ENV=staging` (env từ chối cấu hình khác). Không dùng khóa chung "unknown". Test tích hợp rate limit cần `REDIS_URL` (Valkey thật; CI có service container).
- **`cf_app` chỉ SELECT 7 cột `users`** (`id, email, name, image, locale, created_at, updated_at`); `email_verified`/`totp_enabled`/`is_admin` của người đang đăng nhập chỉ lấy từ phiên Better Auth phía server (`getCurrentUser`). Truy vấn `users` bằng `cf_app` phải chọn cột tường minh (`select()` toàn cột bị từ chối).
- **Biến môi trường:** `.env.local` (khóa riêng như `BETTER_AUTH_SECRET`) được nạp SAU `.env` ở web, worker, script và test (`scripts/lib/load-env.mjs`); chạy lại `print-dev-env.sh` không làm mất khóa. Biến của hệ điều hành/CI thắng cả hai.
- **Next 16 tự sinh `apps/web/AGENTS.md`** khi chạy dev; đã tắt bằng `agentRules: false` trong `next.config.ts`.
- **Server Action trong `(auth)/actions.ts`** chỉ được xuất hàm async (hằng số để ở `lib/`). Form dùng `useActionState`; kết quả luôn là trạng thái trung tính (`lib/auth-form.ts`), không bao giờ là mã lỗi thô của Better Auth.
- **Token phiên lưu thô** (Better Auth, ADR 003); cookie ký bằng `BETTER_AUTH_SECRET`. Luôn đọc phiên bằng `readSession`; tạo phiên Admin bằng `internalAdapter.createSession(userId, false, { isAdminSession: true }, true)` (tham số cuối `true` bắt buộc, nếu không bị ghi đè mặc định).
- **Flag `kill_switch`:** `default_on = true` = được phép chạy, `false` = đang chặn; đang chặn thì override bật KHÔNG bật lại được (override tắt vẫn có hiệu lực). Thứ tự: kill_switch → override → plan → rollout → default_on.
- **Thành viên bị gỡ** = `members.status = 'removed'`, giữ dòng (`cf_app` không DELETE); `tenancy` chỉ tính thành viên `active`.
- **Drizzle phải là một bản duy nhất:** gói khác lấy toán tử (`eq`, `and`…) từ `@flow/db`, không import `drizzle-orm` trực tiếp (hai bản làm kiểu không khớp).
- **Test tích hợp cần máy phụ bật** và `.env` do chủ dự án sinh bằng `infra/scripts/print-dev-env.sh`; agent không chạy script đó.
- **Healthcheck container** phải gọi qua `$HOSTNAME`/IP container (SeaweedFS, Langfuse không nghe `localhost`).
- **Không đọc `node_modules`** của dự án (bị chặn); muốn xem mã thư viện thì `npm pack` vào thư mục tạm.
- **Biome** tự định dạng cả `*.yml`/`*.json`; chạy `pnpm exec biome check --write .` trước khi commit.
- **2FA:** `verifyTOTP`/`verifyBackupCode` của plugin tự đặt cookie phiên khi đúng; mã dự phòng có dạng `xxxxx-xxxxx` — KHÔNG bỏ dấu gạch khi chuẩn hóa (chỉ TOTP mới bỏ khoảng trắng/gạch). Bước mật khẩu đúng mà bật 2FA trả `twoFactorRedirect` và KHÔNG tạo phiên; `apps/web` nhập `@flow/saas-core` (không `@flow/db` gốc — kéo theo `migrations` làm hỏng build), pool `cf_app` mở qua `openTenancy`.

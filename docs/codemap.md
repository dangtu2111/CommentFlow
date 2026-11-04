# Bản đồ source (codemap)

> Lập **một lần** ở GĐ0 (lệnh `/codemap-init`), sau đó chỉ sửa dòng liên quan trong cùng commit thay đổi code. Mục đích: Claude đọc file này thay vì quét lại repo. Giữ dưới ~150 dòng; mỗi dòng một file/thư mục quan trọng.

Cập nhật lần cuối: 2026-11-03 · nhánh `feat/workspace-members` · Gói nội bộ: `@flow/*` (dùng thẳng mã nguồn TS, không build riêng; Node 24, pnpm, TypeScript 6.0.3)

## Lệnh & công cụ

| Việc | Lệnh | Ghi chú |
|---|---|---|
| Cài đặt | `corepack enable && pnpm install --frozen-lockfile` | Node 24 (`.nvmrc`) |
| Lint + format | `pnpm lint` (Biome) · `pnpm lint:i18n` (ESLint một luật, chỉ `apps/web`) | Biome bỏ qua `docs/`, `*.md` |
| Typecheck / test đơn vị / build | `pnpm typecheck` · `pnpm test` · `pnpm build` | test đơn vị **không cần** máy ảo |
| Cổng kế hoạch | `pnpm check:plans` | plan đã duyệt không còn thẻ `[CẦN LÀM RÕ]`/ô trống (`scripts/lib/plan-gate.mjs`); mẫu: `docs/plans/TEMPLATE.md` |
| Cổng số migration | `pnpm check:migrations` | số liên tục/không trùng, khớp `_journal.json` (`scripts/lib/migrations-check.mjs`); chạy ở CI |
| Chạy song song (làn) | `CF_LANE=a pnpm test:db` · `pnpm cf:dev add-test-db a` | DB test riêng `cf_test_<làn>` (`scripts/lib/load-env.mjs`, `infra/scripts/cf-dev-add-test-db.sh`); quy trình: `docs/workflows/parallel.md` |
| E2E cổng 0 (trình duyệt thật) | `pnpm e2e [tham số playwright]` | Playwright (`e2e/`), cần máy ảo + Mailpit + Valkey bật và Chromium cài một lần (`pnpm --filter @flow/e2e exec playwright install chromium`); DB `cf_test` (hoặc `cf_test_<CF_LANE>`); `scripts/e2e.mjs` + `scripts/lib/e2e-env.mjs`; KHÔNG nằm trong `pnpm test` |
| Truy vết FR → test | `pnpm test:trace` | FR của dòng ✅ gap matrix phải có trong tên test; nợ cũ ở `docs/testing/trace-baseline.json` (`scripts/check-test-trace.mjs`, `scripts/lib/test-trace.mjs`); chạy ở CI; chuẩn: `docs/testing/STANDARD.md` §2 |
| Ngưỡng coverage | `pnpm test:coverage` | `@vitest/coverage-v8`, ngưỡng ở `packages/{ai,shared,saas-core}/vitest.config.ts` (ratchet); chạy ở CI, chỉ test đơn vị |
| Ranh giới gói | `pnpm depcruise` | luật ở `.dependency-cruiser.cjs`, test luật ở `tools/boundaries` |
| Test tích hợp (DB thật `cf_test`) | `pnpm test:db` | cần `.env` + máy phụ bật; tự tạo lại schema mỗi lần |
| Migration / kiểm RLS | `pnpm db:migrate` · `pnpm db:check-rls` | chỉ DB `cf_dev`/`cf_test`/`cf_ci`, `APP_ENV` dev/test/ci |
| Cài hàng đợi pg-boss | `pnpm --filter @flow/worker queue:install` | chạy bằng `cf_owner`; worker chạy bằng `cf_app` |
| Máy ảo `cf-dev` | `pnpm cf:dev <up\|ps\|logs\|stats\|sync\|env-init…>` · `pnpm stack:check` | chỉ project `cf-dev`; 7 cổng (có Mailpit 1025/8025); xem `scripts/lib/cf-dev-command.mjs` |
| Python (ml) | `cd services/ml && uv run pytest` · `uv run ruff check .` | |

## Cây thư mục (3 tầng, rút gọn)

| Đường dẫn | Vai trò |
|---|---|
| `apps/web/` | Webhook Meta: `src/app/api/webhooks/meta/route.ts` → `src/server/meta-webhook.ts` (`createMetaWebhookHandlers`: GET bắt tay verify token, POST kiểm `X-Hub-Signature-256` trên thân thô, giới hạn 256 KB, ghi `cf.record_webhook_event` trong `withSystem`, `boss.send('ingest')`) nối ở `src/server/webhook-runtime.ts`. Next.js 16 + next-intl (cookie `NEXT_LOCALE`, mặc định theo Accept-Language): trang xác thực `app/(auth)/`, `/app` tạm, `server/` (gốc lắp ráp auth), `components/{ui,auth}`, `styles/tokens.css`, `/api/health` |
| `apps/worker/` | Worker pg-boss + `/health`; `src/jobs` (+ `ingest.ts`: job `ingest` → bài + bình luận idempotent, bỏ bình luận của Page, failed/dead), `src/queue`, `src/cli`, `src/channels/token-provider.ts` (`createWorkerTokenProvider`: đọc ciphertext bằng `withJob` rồi giải mã; lỗi → kênh `expired`) |
| `services/ml/` | FastAPI chỉ `/health` (chưa nạp model) |
| `packages/shared/` | `AppError`, `parseEnv`, `maskPii`/`MaskedText`, locale + chuỗi vi/en (gói lá) |
| `packages/db/` | Drizzle schema `core`/`cf`, `migrations/*.sql`, RLS, `createDb`, `check-rls`, CLI |
| `packages/saas-core/` | `auth` (Better Auth + `flows`), `notify` (gửi thư), `tenancy`, `flags` — không biết gì về sản phẩm |
| `packages/ai/` | `createLlmClient().call()` → LiteLLM + ghi `ai_usage` (chưa có pipeline) |
| `packages/db/src/schema/cf/` | Bảng sản phẩm (schema `cf`): `ai_usage`, `channels`, `posts`, `comments`, `webhook_events` (CH-SCHEMA, ADR 007): RLS + ghi theo vai trò/hệ thống, token Page ẩn khỏi `cf_app`, khóa ngoại ghép chống chéo workspace |
| `packages/connectors/` | Giao diện `PlatformConnector` + khai báo khả năng từng nền tảng (FR-016): `evaluateAction`, `DECLARED_CAPABILITIES`, registry, hợp đồng `checkConnectorContract`, connector giả `@flow/connectors/testing`; chỉ phụ thuộc `@flow/shared` (luật depcruise); mã hóa token Page: `token-cipher.ts` (`parseTokenKeys` ← env `TOKEN_ENC_KEYS`, `createTokenCipher`: AES-256-GCM, nonce ngẫu nhiên, AAD `workspace|channel|key_version`, `reencrypt`), `channel-token-provider.ts` (`createChannelTokenProvider` → `TokenProvider`; không giải mã được → `onUndecryptable` + `TOKEN_EXPIRED`, không `cause`); chưa có connector thật (làm ở `FB-OAUTH`/`WH-INGEST`) |
| `infra/` | Compose (`docker-compose.yml` nền + `.dev.yml`), `postgres/init`, `litellm/config.yaml`, `scripts/print-dev-env.sh` |
| `e2e/` | Kịch bản Playwright cổng 0 (`tests/gate0.spec.ts`, vi+en) và `support/{totp,mailpit,i18n,env,flows}.ts` (test đơn vị cạnh file); không import gói nội bộ, không nằm trong depcruise |
| `docs/testing/` | `STANDARD.md` (chuẩn test), `KIEM_TRA_TAY.md` (kiểm tra tay dồn), `trace-baseline.json` (nợ truy vết), `ALLOWLIST_DE_XUAT.md` (đề xuất allow, chưa áp); thứ tự toàn bộ tính năng: `docs/plans/MASTER.md` |
| `.claude/skills/` | 3 skill văn bản (`test-driven-development`, `systematic-debugging`, `verification-before-completion`); nguồn + giấy phép: `docs/decisions/006-skills.md` |
| `scripts/`, `tools/boundaries/` | Script vận hành (`cf-dev*`, `stack-check`, `e2e`) và test luật depcruise |
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
| Workspace / thành viên | `packages/saas-core/src/tenancy/` | `tenancy.ts` (tạo workspace có múi giờ/ngôn ngữ + `action_logs`, liệt kê workspace); `workspace-admin.ts` `createWorkspaceAdmin` (danh sách/đổi vai trò/tạm khóa/gỡ thành viên, lời mời: tạo/thu hồi/gửi lại/xem trước/nhận; chỉ Owner; email báo Owner); `action-log.ts`; `openWorkspaceServices` (một pool cf_app) | 09 §3.1 · ADR 005 |
| Cổng `/app` + chọn workspace | `apps/web/src/server/{require-app-user,app-access,workspace-selection,workspace-cookie,invite-cookie}.ts`, `lib/{members-form,workspace-form,invite-token}.ts` | `requireAppUser({workspace,role,twoFactor})` BẮT BUỘC cho mọi trang/route/Server Action dưới `app/app/**` (test quét `require-app-user.scan.test.ts`); quyết định thuần ở `decideAppAccess`; cookie ký `cf-workspace`/`cf-invite` dùng khóa HKDF (`createSignedValueCodec`, `auth/signed-value.ts`) | 13 §2–§4 · ADR 005 |
| Giao diện workspace/thành viên/lời mời | `apps/web/src/app/app/onboarding/workspace/`, `app/app/(guarded)/members/`, `app/app/workspace/actions.ts`, `app/invite/[token]/` (+ `start`, `clear`), `components/app/` | Tạo workspace, bộ chuyển (`<details>`), trang Thành viên (Owner), nhận lời mời công khai; thư mời/báo Owner ở `notify/templates.ts` | 08 · UF-1 |
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
| Tạo workspace (thành viên chỉ vào qua lời mời) | `createTenancy` → `createWorkspace` (không còn `addMember`); test dựng thành viên bằng `seedMemberForTest` (`packages/saas-core/tests/helpers.ts`, chỉ test) | `packages/saas-core/src/tenancy/tenancy.ts:30,47,60` |
| Hỏi flag | `createFlags` → `isEnabled` | `packages/saas-core/src/flags/flags.ts:37` |
| Gọi LLM + ghi `ai_usage` | `createLlmClient` → `call` | `packages/ai/src/llm-client.ts:101` |
| Chạy job theo workspace / hệ thống | `workspaceJob` · `systemJob` | `apps/worker/src/jobs/run-job.ts:33` · `:48` |
| Đăng ký handler hàng đợi | `boss.work(...)` | `apps/worker/src/main.ts:22` |
| Nhận webhook / gửi trả lời bình luận | Chưa có | |

## Bẫy đã biết

- **`withActor(workspaceId, userId, fn)` (0016, ADR 005 §3):** thao tác GHI chỉ-Owner (`members`, `invitations`, `workspaces` sửa) phải đi qua `withActor` với `userId` từ phiên server; `withWorkspace` thuần chỉ đọc được `members` và KHÔNG ghi các bảng đó. Bảng GĐ1 mới phải chọn policy ghi theo vai trò ngay lúc tạo (mẫu `core.is_workspace_owner()`/`is_workspace_member()`). UPDATE bị RLS ẩn dòng trả 0 dòng không lỗi → kiểm `returning`. `invitations.token_hash` không đọc được bằng `cf_app` (`select()` toàn cột trên `invitations` bị từ chối). `action_logs` loại `user` đòi `actor_id = app.user_id` và là thành viên active; chỉ `system`/`ai` khi không có người dùng. `workspaces.created_by` bắt buộc = người tạo khi INSERT (đường khởi tạo Owner đầu tiên); `members` chỉ UPDATE `role`/`status`/`updated_at`. `check-rls` đỏ nếu có policy permissive thứ hai không có marker Owner (OR mở lại quyền). Không có đường thêm thẳng thành viên (migration 0017): `members` INSERT chỉ là đường khởi tạo Owner đầu tiên; thành viên khác vào qua `accept_invitation`; test dựng dữ liệu bằng `seedMemberForTest`.

- **Lời mời (ADR 005):** nhận lời mời chỉ qua `core.accept_invitation(token_hash)` (SECURITY DEFINER, gọi trong `withUser`, KHÔNG nhận email/user id, mọi lỗi → 0 dòng). Tên cột trả về khác tên cột bảng (plpgsql nhập nhằng). `cf_app` chỉ UPDATE `invitations.revoked_at`; không DELETE. Trong hàm DEFINER, `search_path` không có `public` nên citext phải so bằng `lower(x::text)`.
- **Owner cuối cùng** được trigger `members_guard_last_owner` giữ; lỗi `23514` + constraint `members_last_owner` → `AppError('CONFLICT')`. Dùng `members.id` (không phải user id) làm khóa trong form; id lạ/workspace khác → `NOT_FOUND` → web trả 404.
- **`isRlsViolation` dò chữ "row-level security" trong thông báo lỗi Postgres** (tiếng Anh): hạ tầng phải để `lc_messages` của DB là `C`/`en_US` cho `cf_app`, nếu không lỗi RLS nổi lên thành 500 thay vì FORBIDDEN. `cf_app` chỉ UPDATE `workspaces.name/slug/timezone/default_lang/ai_enabled/updated_at` (0018); tính năng sau cần sửa `status`/`ai_cost_cap_usd`/`emergency_stopped_at` phải thêm GRANT cột hoặc hàm DEFINER riêng.
- **Bảng kênh/bình luận (ADR 007):** `cf_app` KHÔNG đọc/ghi được `channels.access_token_enc`, KHÔNG sửa `send_suspended_*`/`rate_limit_override`; mọi `select()` toàn cột trên `cf.channels` bị từ chối → chọn cột tường minh. Không DELETE. Đường người dùng dùng `withActor` (thành viên/Owner), job dùng `withJob` (`app.ctx='system'`, `core.is_system_context()`; `workspaceJob` của worker); `withWorkspace` trần chỉ ĐỌC (không ghi các bảng này); `channels` không INSERT (hàm DEFINER ở TOKEN-ENC), dùng `channelReadColumns` thay vì `select()` toàn cột; trigger `guard_channel_user_update`/`guard_comment_user_update` giới hạn cột ở đường người dùng; `webhook_events` chỉ hệ thống ghi, workspace_id NULL ghi bằng hàm DEFINER (WH-INGEST). Cùng một Page ở nhiều workspace → WH-INGEST phải nhân sự kiện.
- **Khung ứng dụng (APP-SHELL, docs/08 §3):** `apps/web/src/app/app/(guarded)/layout.tsx` = cổng `requireAppUser` + thanh trên (thương hiệu, `WorkspaceSwitcher`, `LocaleSwitcher`, tên + Đăng xuất) + `components/app/shell-nav.tsx` (client, `usePathname`) + khe `data-slot="banners"` (CH-STATUS-BANNER). Danh sách điều hướng ở `src/lib/app-nav.ts` (`navGroupsFor(role)`, `isNavActive`): CHỈ trang đã tồn tại, Owner mới thấy Thành viên; thêm mục mới = thêm vào `ENTRIES` + khóa `shell.nav.*`.
- **Banner trạng thái kênh (CH-STATUS-BANNER, FR-012):** `packages/db/src/queries/channel-alerts.ts` (`listChannelAlerts`: kênh `expired`/`revoked`/`error`, chỉ đọc) → `apps/web/src/lib/channel-banner.ts` (`buildBannerModel`: gom theo trạng thái, ≤ 3 tên + "và N", khác câu cho Owner/Staff) → `components/app/system-banners.tsx` lấp khe `data-slot="banners"` trong layout `(guarded)` (lỗi nạp → bỏ qua banner, không hỏng khung; cập nhật sau lần tải đầy đủ kế tiếp).
- **Chi tiết + khóa mềm (INBOX-DETAIL-LOCK, FR-041):** chọn bằng `?c=<uuid>`; `packages/db/src/queries/comment-detail.ts` (`getCommentDetail`) + `comment-lock.ts` (`acquireCommentLock`: MỘT câu UPDATE có điều kiện, TTL 120 giây giờ DB; `releaseCommentLock`: chỉ người giữ); Server Action `(guarded)/comments/actions.ts` (`lockCommentAction`/`unlockCommentAction`, `requireAppUser`, UUID) → `components/comments/comment-lock.tsx` (client: lấy khóa khi mở, gia hạn mỗi 60 giây, mở khi đóng) + `comment-detail.tsx` (cột phải). Khóa chỉ là cảnh báo; chặn gửi trùng thật = `sendRecheck` (FB-REPLY).
- **Trang Bình luận (INBOX-LIST, FR-040):** `apps/web/src/app/app/(guarded)/comments/page.tsx` (Server Component, `requireAppUser`) → `src/server/inbox.ts` (`loadInbox`: một giao dịch `withActor`) → `packages/db/src/queries/inbox.ts` (`listComments`, `countCommentsByTab`, `listInboxChannels`: chỉ đọc; tab = điều kiện trạng thái; tìm kiếm `unaccent` + `ILIKE` đã thoát `% _ \`; phân trang con trỏ `(COALESCE(created_time, created_at), id)`; bỏ bình luận đã gộp). Tham số URL: `src/lib/inbox-filters.ts` (Zod, `buildInboxHref`); định dạng: `src/lib/inbox-format.ts`; thành phần: `src/components/comments/*`; `src/server/db.ts` = `FlowDb` dùng chung của web. Danh sách tab/nền tảng khai báo hai nơi (db + `inbox-filters.ts`), có test khớp nhau.
- **Webhook Meta (WH-INGEST, migration 0022):** chữ ký kiểm ở web (`verifyMetaSignature` trong `@flow/connectors`, thân thô, so sánh thời gian hằng); hàm DEFINER `cf.record_webhook_event` chỉ chạy ở NGỮ CẢNH TRẦN (`withSystem`): rải sự kiện cho mỗi kênh `connected` + `webhook_subscribed` khớp `(platform, external_id)` (một Page ở nhiều workspace → mỗi workspace một dòng), chưa map → một dòng `workspace_id NULL`; `event_hash` chỉ gồm id (không nội dung). Payload lưu là sự kiện đã chuẩn hóa (`serializeEvent`), không phải thân thô của Meta. Job `ingest` chỉ mang `{workspaceId, eventId}`. Thử cục bộ: `pnpm webhook:send -- --page <PAGE_ID>` (docs/testing KT-002).
- **Khóa mã hóa lúc khởi động (migration 0021):** worker gọi `verifyTokenKeysAtStartup` (`cf.channel_key_versions()` + `assertTokenKeysCoverVersions`); thiếu khóa cho phiên bản đang dùng → dừng khởi động. `TokenKeyMissingError` (lỗi cấu hình) KHÔNG làm kênh `expired`; sai khóa/AAD mới `expired`.
- **Token Page (ADR 007 §2, migration 0020):** mã hóa/giải mã trong mã ứng dụng (`@flow/connectors`), DB chỉ giữ ciphertext. Web ghi/xóa qua `createChannel`/`setChannelToken`/`clearChannelToken` (`packages/db/src/channel-tokens.ts`, hàm DEFINER, Owner hoặc hệ thống); CHỈ `withJob` đọc được ciphertext (`readChannelToken`) — gửi trả lời luôn đi qua job worker. Không log token/ciphertext/khóa. Trigger `guard_channel_user_update` chỉ áp cho `current_user='cf_app'`.
- **Connector (FR-016):** `ChannelRef` KHÔNG chứa bí mật — token đi qua `TokenProvider` tiêm lúc dựng connector, không qua tham số/log. Pipeline/UI/`guard`/`sendRecheck` PHẢI hỏi `evaluateAction(capabilities, action, ctx)` thay vì viết cứng luật nền tảng; `setHidden`/`privateReply`/`sendMessage` có mặt ⇔ khai báo `supported` (`checkConnectorContract` trong test của MỌI connector thật). Giá trị spec ghi "cần kiểm" (TikTok 48 giờ/150 ký tự, dark post Instagram) mang `verified: false`. `textLengthOf` đếm theo điểm mã Unicode; thiếu/sai độ dài → `TEXT_REQUIRED` (đóng khi không chắc).
- **Server Component không đặt được cookie:** cookie `cf-workspace`/`cf-invite` chỉ ghi trong Server Action/route handler (`/invite/<token>/start`, `/invite/clear`).
- `Intl.supportedValuesOf('timeZone')` KHÔNG có `Asia/Ho_Chi_Minh` — dùng `WORKSPACE_TIME_ZONES`.
- **Đồng hồ máy ảo lệch ~1 giây** so với máy code làm test `admin-session-cap` ("created_at ở tương lai") đỏ — không liên quan mã; đồng bộ giờ máy ảo.

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

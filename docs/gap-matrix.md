# Gap matrix — spec ↔ code

> Nguồn sự thật duy nhất về "cái gì đã có / còn thiếu". Dự án làm mới từ đầu → lập lần đầu thành **danh sách việc theo `16_Development_Roadmap.md` §3** (tất cả "Thiếu"); sau đó **chỉ sửa dòng** khi làm xong/đổi một mục.

Trạng thái: Đã có · Một phần · Khác spec · Thiếu · Không chắc · ✅ Xong (đã làm trong dự án này)

| Mã | Yêu cầu | Trạng thái | Bằng chứng (file:dòng) | Việc cần làm | Ước lượng | GĐ | Nhánh |
|---|---|---|---|---|---|---|---|
| GĐ0-MONOREPO | Monorepo `09` §3, CI (lint, typecheck, test, depcruise, gitleaks, job database) | ✅ Xong | `.github/workflows/ci.yml`, `.dependency-cruiser.cjs` | — | | 0 | chore/scaffold (claude) |
| GĐ0-COMPOSE-DEV | 7 dịch vụ chạy trên máy ảo `cf-dev` có health check; SeaweedFS thay MinIO; Valkey thay Redis (ADR 001) | ✅ Xong | `infra/docker-compose.yml`, `scripts/stack-check.mjs` | — | | 0 | chore/scaffold (claude) |
| GĐ0-DB | Schema `core`/`cf`, migration, RLS, `withWorkspace`, `check-rls`, chặn migration nhầm môi trường (FR-092 bảng, FR-117 bảng, FR-118) | ✅ Xong | `packages/db/src/client.ts:78`, `packages/db/migrations/0001,0004` | — | | 0 | chore/scaffold (claude) |
| GĐ0-AUTH-CORE | Đăng ký, đăng nhập, phiên (Better Auth, argon2id, phiên 14 ngày, cookie ký) (FR-001–005 phần lõi) | ✅ Xong (chưa có giao diện) | `packages/saas-core/src/auth/auth.ts:40` | UI đăng ký/đăng nhập (xem `UI-AUTH`) | | 0 | chore/scaffold (claude) |
| GĐ0-TENANCY | Workspace, thành viên Owner/Staff, liệt kê workspace để chuyển | ✅ Xong (logic, chưa có giao diện) | `packages/saas-core/src/tenancy/tenancy.ts:30` | UI bộ chuyển workspace; lời mời (`AUTH-INVITE`) | | 0 | chore/scaffold (claude) |
| GĐ0-FLAGS | `isEnabled`, cache 30 giây, `NOTIFY flags_changed` (FR-117 phần mã) | ✅ Xong | `packages/saas-core/src/flags/flags.ts:37` | Trang Admin Feature flags (GĐ3) | | 0 | chore/scaffold (claude) |
| GĐ0-AI-WRAPPER | Lớp bọc LLM + `ai_usage` (FR-034 phần lớp bọc) | ✅ Xong | `packages/ai/src/llm-client.ts:101` | Khóa ảo theo workspace (`AI-VIRTUALKEY`); test gọi LiteLLM thật cần `LITELLM_API_KEY` trong `.env` | | 0 | chore/scaffold (claude) |
| GĐ0-QUEUE | pg-boss: cài bằng `cf_owner`, worker chạy bằng `cf_app`, `workspaceJob`/`systemJob` | ✅ Xong | `apps/worker/src/jobs/run-job.ts:33` | Đường cài cho staging/production (`QUEUE-PROD-INSTALL`) | | 0 | chore/scaffold (claude) |
| GĐ0-I18N | next-intl vi/en (cookie), test khớp khóa, kiểm chuỗi viết cứng (FR-119 khung) | ✅ Xong (khung) | `packages/shared/src/i18n/`, `apps/web/eslint.config.mjs` | Dịch toàn bộ giao diện theo từng trang | | 0 | chore/scaffold (claude) |
| AUTH-RLS-OWN | Policy theo `current_user_id()` cho `users`/`sessions`/`accounts`/`two_factors` (chỉ thấy dòng của mình khi có `app.user_id`; ngữ cảnh hệ thống như Better Auth vẫn phải đọc được theo email/token) — mô tả ở `10` §4 | Thiếu | `packages/db/migrations/` | Policy cho phép khi `app.user_id` NULL hoặc khớp; cần xem lại luồng đăng nhập của Better Auth | | 1 | |
| UI-AUTH | Trang đăng ký, đăng nhập, chuyển workspace, 2 ngôn ngữ (cần `design/stitch` + design tokens `08` §2) | Thiếu | — | `/stitch-sync` rồi dựng giao diện | | 0 | |
| AUTH-2FA | 2FA TOTP + 10 mã dự phòng, bắt buộc Owner/Admin (13 §2, ADR 003) | Thiếu | — | Plugin twoFactor (`storeBackupCodes: "encrypted"`), bảng `two_factors`, middleware ép Owner/Admin | | 0 | chore/scaffold (chừa chỗ) |
| AUTH-RATELIMIT | Rate limit đăng nhập 5 lần/15 phút theo IP+email (Valkey, khóa `sys:`); quên mật khẩu 3 lần/giờ (13 §2). **Bắt buộc có trước khi mở endpoint ra ngoài** (argon2 tốn 19 MiB RAM mỗi lần) | Thiếu | — | Lớp tự làm trên Valkey nếu rate limiter của Better Auth không khóa theo email | | 0 | chore/scaffold (chừa chỗ) |
| AUTH-FORGOT | Quên mật khẩu (dùng bảng `verifications`) + kiểm mật khẩu lộ (13 §2) | Thiếu | — | Luồng email + token; cần `notify` | | 0 | |
| AUTH-INVITE | Lời mời thành viên (bảng `invitations`; nhận lời mời bằng token ngoài ngữ cảnh workspace cần hàm SECURITY DEFINER hẹp có `SET search_path`, hoặc role hệ thống) | Thiếu | — | Nhánh sau tenancy | | 0 | |
| AUTH-ADMIN-SESSION | Phiên Admin 8 giờ (hạn cứng đã làm ở `readSession`) + "Xem như khách" tự viết (13 §3.2, bảng `admin_impersonations`) + role DB Admin riêng ghi `is_admin`/`admin_role` | Một phần | `packages/saas-core/src/auth/session.ts:11` | Màn Admin, `admin_impersonations`, role Admin | | 3 | |
| AI-VIRTUALKEY | Khóa ảo LiteLLM theo workspace có ngân sách riêng (13 §4); hiện một khóa dev chung (chỉ model `mock-llm`) | Thiếu | `packages/ai/src/llm-client.ts` (`apiKey` dùng chung) | Hàm `resolveKey(workspaceId)` + kiểm khóa cache LiteLLM có chứa workspace | | 2 | |
| FLAGS-RECONNECT | Kết nối lại LISTEN có lùi dần + cảnh báo khi mất kết nối | Thiếu | `packages/saas-core/src/flags/flags.ts` | Backoff + log | | 1 | |
| QUEUE-PROD-INSTALL | Đường cài schema pg-boss + cấp quyền cho staging/production (hiện chỉ dev/test/ci); cân nhắc REVOKE UPDATE `pgboss.version` khỏi `cf_app`; quy ước payload job chỉ chứa ID | Thiếu | `apps/worker/src/queue/install.ts` | Job CI có duyệt tay (`15` §6) | | 3 | |
| DB-MAINTENANCE-ROLE | Role bảo trì cho retention (gộp `ai_usage` 90 ngày, xóa `webhook_events`) và xóa workspace vĩnh viễn (hiện `cf_app` không có DELETE) | Thiếu | `packages/db/migrations/0004_*.sql` | Role + job | | 3 | |
| DB-BOOTSTRAP | Migration 0000 giả định extension `citext` và role `cf_app` đã có (do `infra/postgres/init`); staging/production tạo DB bằng cách khác sẽ lỗi khó đọc | Thiếu | `packages/db/migrations/0000_init_schema.sql` | Thêm `CREATE EXTENSION IF NOT EXISTS citext` và kiểm role ở migration kế tiếp | | 3 | |
| OAUTH-TOKEN-ENC | Mã hóa `accounts.access_token/refresh_token/id_token` khi bật OAuth (13 §5) | Thiếu | `packages/db/src/schema/core/auth.ts` | `account.encryptOAuthTokens` hoặc ADR chấp nhận | | 4 | |
| CLI-PARSEENV | CLI đọc `process.env` trực tiếp, chưa qua `parseEnv` (Zod) | Thiếu | `packages/db/src/cli/*`, `apps/worker/src/cli/*` | Dùng `parseEnv` | | 1 | |
| STAGING-DEPLOY | Compose `cf-staging`, Dockerfile web/worker, runner GitHub tự host, Cloudflare Tunnel | Thiếu | — | **Hoãn đến khi có tên miền** (chủ dự án chốt 03/11) | | 3 | |
| DESIGN-TOKENS | Design tokens từ `08` §2 | Thiếu | — | Cần đọc `08` §2 | | 0 | |

## Quyết định cần chủ dự án

| # | Spec nói | Code đang làm | Đề xuất | Quyết định |
|---|---|---|---|---|
| 1 | `09` §10: kill_switch chặn thì override bật không bật lại được | `evaluateFlag`: kill_switch → override → plan → rollout → default_on | — | **Đã chốt 03/11** và làm xong |
| 2 | `10` §3.1: `members.status` ∈ active/suspended/removed, `removed` giữ dòng | CHECK (migration 0005) + `cf_app` không DELETE members (0006) + tenancy chỉ tính `active` | — | **Đã chốt 03/11** và làm xong |
| 3 | `10` §4, `13` §4: mô tả `app.user_id` | Đã ghi vào spec; áp cho `members`/`workspaces` | Áp policy "của chính mình" cho `users`/`sessions`/`accounts`/`two_factors` (`AUTH-RLS-OWN`) | Spec **đã chốt 03/11**; phần áp dụng còn thiếu |
| 4 | `workspaces.ai_enabled` mặc định `true` (chỉ gợi ý) | Đúng | — | **Đã chốt 03/11** |
| 5 | XChaCha20-Poly1305 cho 2FA | Đúng | Xoay `BETTER_AUTH_SECRET` làm hỏng secret 2FA (ADR 003) | **Đã chốt 03/11** |

## Theo dõi chi phí Claude Code (cuối tuần)

| Tuần | Chi phí | Số mục xong | Số lần gọi verifier | Ghi chú (phiên bất thường, đọc lại nhiều) |
|---|---|---|---|---|
| 2026-11-03 | (chưa ghi) | 9 (GĐ0 khung) | 2 (`verifier-security` + `verifier-db`, một lần cuối nhánh, 0 mục "Chặn merge") | Phiên dài; `node_modules` bị chặn đọc nên phải `npm pack` vào thư mục tạm |

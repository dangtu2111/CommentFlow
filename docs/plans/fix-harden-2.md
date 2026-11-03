# Kế hoạch — nhánh `fix/harden-2`

Việc: **HARDEN-2** + **AUTH-RLS-OWN** (gap matrix), kèm sửa `docs/13` §5 (được phép) và thêm **Mailpit** vào `cf-dev`.
Trạng thái duyệt: **ĐÃ DUYỆT 03/11/2026 kèm điều chỉnh** (mục "Quyết định đã chốt"). Agent: claude. Tách nhánh từ `main` (`3f5d6de`).

## Tóm tắt (đọc trước)

Siết nốt các lỗ hổng lần kiểm chứng thứ hai còn nêu: hạn 8 giờ của phiên Admin được **ép trong database** (trigger + cấm đổi cờ Admin), các bảng đăng nhập (`users`, `sessions`, `accounts`, `verifications`) chỉ đọc được khi có **ngữ cảnh rõ ràng** (không ngữ cảnh = không thấy gì), `check-rls` chặt hơn, và vài chỗ nhỏ (cookie Secure, rào lệnh `cf-dev`, log che bí mật). Thêm Mailpit (hộp thư giả) **chỉ vào `cf-dev`, không bao giờ vào `cf-staging`**. Rủi ro chính: RLS trên bảng xác thực có thể làm hỏng luồng đăng nhập — lưới an toàn là test trên DB thật cho từng ngữ cảnh và toàn bộ test auth hiện có.

## Quyết định đã chốt (03/11)

1. Bỏ "không ngữ cảnh = thấy hết". Ngữ cảnh `app.ctx = 'auth'` (helper `withAuthContext`) là cách duy nhất để thấy hết `sessions`/`accounts`/`verifications`; không ngữ cảnh → 0 dòng; `withUser` → chỉ dòng của mình; `withWorkspace` → không thấy `sessions`/`accounts`. Test âm tính: truy vấn không ngữ cảnh trả 0 dòng.
2. Áp RLS cho `verifications` theo cùng quy tắc (chỉ `app.ctx = 'auth'`).
3. Trigger 8 giờ chạy cả INSERT và UPDATE; `cf_app` **không** có quyền UPDATE cột `is_admin_session` (cũng không `created_at`); test: đổi `is_admin_session` bằng `cf_app` bị từ chối; Better Auth gia hạn phiên Admin → `expires_at ≤ created_at + 8h`.
4. `appEnv` bắt buộc ở `createAuth`; hạn 8 giờ ở DB (không ép route); Mailpit không mật khẩu, cổng `8025`/`1025`, chỉ `cf-dev`.
5. Được sửa `docs/10` §4 (dòng *Trạng thái* của bullet `app.user_id`) sau khi xong; xóa plan/handoff của `chore-scaffold` ở cuối nhánh.

## Thiết kế ngữ cảnh (AUTH-RLS-OWN)

Gọi `ws = current_workspace_id()`, `u = current_user_id()`, `auth = in_auth_context()` (hàm mới: `app.ctx = 'auth'`).

| Bảng | Không ngữ cảnh | `withAuthContext` / `db.auth` | `withUser(u)` | `withWorkspace(ws)` |
|---|---|---|---|---|
| `sessions`, `accounts` (cột `user_id`) | **0 dòng** | thấy/ghi tất cả | chỉ dòng của mình (đọc/ghi) | **0 dòng** |
| `verifications` | **0 dòng** | thấy/ghi tất cả | **0 dòng** | **0 dòng** |
| `users` | **0 dòng** | thấy/ghi tất cả | chỉ dòng của mình | chỉ người dùng là thành viên `active` của workspace; không ghi |
| `two_factors` (chưa có bảng) | — | — | — | Khi tạo bảng phải có policy cùng mẫu `sessions`; `check-rls` đỏ nếu thiếu |

- Điều kiện "của mình" luôn đòi `ws IS NULL AND u IS NOT NULL` (đặt cả hai biến vẫn không mở rộng quyền).
- Ghi (`WITH CHECK`): `auth`, hoặc đúng người dùng của dòng (ngữ cảnh người dùng); không ghi được từ ngữ cảnh workspace/không ngữ cảnh.
- Chủ sở hữu bảng (`cf_owner`, migration) không bị ảnh hưởng (không `FORCE`).
- **Cách Better Auth vào ngữ cảnh `auth`:** adapter Better Auth tự gọi nhiều truy vấn rời rạc nên không bọc từng lệnh bằng `set local` được. `FlowDb` có thêm `auth` (một pool **riêng**, mọi kết nối mở với `app.ctx = 'auth'` qua tham số khởi động; chỉ truyền cho adapter Better Auth) và `withAuthContext(fn)` (giao dịch + `set local app.ctx = 'auth'`, dùng cho hàm của `saas-core` như `readSession`, thu hồi phiên). `db.system`/`withSystem` **không còn thấy** bốn bảng này. *(Khác chữ "set local" của quyết định #1 ở đúng một điểm: pool riêng đặt ở mức kết nối cho adapter; hàm của mình dùng `set local`.)*

## File sẽ đọc (≤ 8, kèm lý do)

| File | Lý do |
|---|---|
| `packages/saas-core/src/auth/auth.ts`, `session.ts`, `revoke.ts` | Chuyển sang `db.auth`/`withAuthContext`, `appEnv` bắt buộc, đơn giản hóa `readSession` |
| `packages/db/src/client.ts` | Thêm `auth`, `withAuthContext` |
| `packages/db/src/check-rls.ts` (+ test) | Siết kiểm policy, thêm loại bảng xác thực |
| `packages/db/migrations/0001`, `0004` (grep policy hiện có) | Viết policy mới nhất quán |
| `scripts/lib/cf-dev-command.mjs`, `apps/worker/src/logger.ts` (+ test) | Chặn cờ ngắn dính; che thêm trường |
| `infra/docker-compose*.yml`, `scripts/stack-check.mjs` + `lib` | Mailpit và kiểm cổng mới |
| Tài liệu Mailpit (WebFetch) | Xác nhận biến môi trường, health check |

## File sẽ sửa / tạo

| File | Nội dung |
|---|---|
| `packages/db/migrations/0007_admin_session_cap.sql` (mới, custom) | Trigger `BEFORE INSERT OR UPDATE ON core.sessions` (phiên Admin: `expires_at ≤ created_at + 8h`; `created_at` chỉ được lùi); thu quyền UPDATE của `cf_app` trên `sessions`, chỉ còn cột `expires_at`, `updated_at`, `ip`, `user_agent` |
| `packages/db/migrations/0008_auth_context_rls.sql` (mới, custom) | Hàm `core.in_auth_context()`; bật RLS và policy cho `users`, `sessions`, `accounts`, `verifications` theo bảng trên |
| `packages/db/src/client.ts` | `auth` (pool riêng), `withAuthContext` |
| `packages/saas-core/src/auth/{auth,session,revoke}.ts` | Dùng `db.auth`/`withAuthContext`; `appEnv` bắt buộc (kiểu hợp, chỉ dev/test/ci được tắt `Secure`); `readSession` còn là lớp thứ hai |
| `packages/db/src/check-rls.ts` | `every` thay `some` cho policy permissive; kiểm `WITH CHECK`; `has_any_column_privilege`; lọc `polroles`; đối chiếu biểu thức chuẩn; nhóm bảng xác thực (`in_auth_context`) |
| `scripts/lib/cf-dev-command.mjs` | Chặn cờ ngắn gộp chứa `v`/`p`/`f` |
| `apps/worker/src/logger.ts` | Thêm `access_token`, `refresh_token`, `api_key`, `client_secret`, `Authorization`, `err.config.headers.*`, `err.request.headers.*` |
| `infra/docker-compose.dev.yml` (+ nền nếu cần) | Dịch vụ `mailpit` **chỉ trong cf-dev**; không có trong bất kỳ file staging |
| `scripts/stack-check.mjs` + `lib` (+ test) | Kiểm SMTP (banner `220`) và giao diện Mailpit |
| `env.example`, `infra/scripts/print-dev-env.sh` | `SMTP_HOST`, `SMTP_PORT`, `MAILPIT_URL` (không bí mật) |
| `docs/13_Security_Design.md` §5 | Tách dòng "Mật khẩu, mã dự phòng, token mời" |
| `docs/10_Database_Design.md` §4 | Cập nhật *Trạng thái* và ba ngữ cảnh (đã được cho phép) |
| ADR 001 §4, `codemap.md`, `gap-matrix.md`; xóa `plans/handoff chore-scaffold` | Ghi nhận, đóng việc |
| Test của `db`, `saas-core` hiện có | Chuyển truy cập bảng xác thực sang `db.auth`/`withAuthContext`; dùng pool chủ sở hữu để gieo `is_admin_session`/`created_at` |

## Migration

`0007`, `0008` (custom SQL, không đổi schema Drizzle). Đường lùi ghi ở đầu mỗi file. Áp lên `cf_dev`/`cf_test` bằng `pnpm db:migrate`; không đụng staging.

## Test viết trước (theo thứ tự)

1. **Trigger + quyền cột (DB thật):** chèn phiên Admin `expires_at = +14 ngày` → lưu `created_at + 8h`; sửa `expires_at` vượt hạn → bị cắt; `created_at` không dời muộn được; phiên app không đổi; **`cf_app` đổi `is_admin_session` hoặc `created_at` → `42501`**; **Better Auth gia hạn phiên Admin (gọi thẳng `auth.api.getSession`, không qua `readSession`) → `expires_at ≤ created_at + 8h`, sau 8 giờ trả `null`**; hằng số SQL khớp `ADMIN_SESSION_SECONDS`.
2. **RLS bảng xác thực (DB thật) theo bảng thiết kế:** **âm tính: không ngữ cảnh (`db.system`, `withSystem`) đọc `users`/`sessions`/`accounts`/`verifications` đều 0 dòng và ghi bị `42501`**; `withAuthContext`/`db.auth` thấy và ghi được; `withUser(a)` chỉ dòng của a, không sửa được dòng của b; `withWorkspace(W)` không thấy `sessions`/`accounts`/`verifications`, `users` chỉ thành viên `active` (không thấy `removed`/`suspended`/người ngoài W), không ghi; đặt cả `ws` lẫn `u` vẫn không thấy `sessions`/`accounts`. **Toàn bộ test auth hiện có vẫn xanh** (đăng ký, đăng nhập, đổi mật khẩu, `readSession`) — bằng chứng luồng Better Auth không hỏng.
3. **`check-rls`** (DB giả + thật): hai policy (một đúng, một `USING (true)`) → đỏ; `WITH CHECK (true)` trên UPDATE → đỏ; quyền theo cột thiếu policy → đỏ; policy `TO cf_owner` không được tính; biểu thức sai mẫu → đỏ; bảng xác thực thiếu policy `in_auth_context` → đỏ.
4. **`createAuth`:** `appEnv` ngoài danh sách (`'prod'`, `undefined`) → `CONFIG_INVALID`; `Secure` tắt chỉ ở dev/test/ci.
5. **`cf-dev-command`:** `-pfoo`, `-fx.yml`, `-vt1`, `-dv` bị từ chối; `-d`, `--tail=50` vẫn qua.
6. **Logger:** các tên snake_case, `Authorization`, `err.config.headers.*` bị che.
7. **`stack-check`:** đọc banner SMTP (`220 …` đạt, khác thì lỗi).

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/db test && pnpm --filter @flow/db test:db
pnpm --filter @flow/saas-core test && pnpm --filter @flow/saas-core test:db
pnpm --filter @flow/worker test && pnpm --filter @flow/scripts test
pnpm lint && pnpm typecheck && pnpm depcruise
pnpm db:migrate && pnpm db:check-rls && pnpm cf:dev up -d && pnpm stack:check
```

## Mailpit (cf-dev)

- Image `axllent/mailpit:v1.33.0` (MIT); ~20–40 MB RAM, `mem_limit: 128m`; **chỉ trong `docker-compose.dev.yml`/project `cf-dev`, không bao giờ trong `cf-staging`**.
- **Cổng cần mở portproxy + tường lửa (chỉ `192.168.1.96`): `8025` (giao diện web) và `1025` (SMTP).** Cổng publish của `cf-dev`: 5 → 7. Không mật khẩu, không xác thực SMTP.
- Chưa có mã gửi email (làm ở `AUTH-FORGOT`); lần này chỉ hạ tầng, biến môi trường, kiểm sức khỏe; đo RAM thật ghi vào `001-stack.md`.

## Cần kiểm chứng độc lập không?

**Có** — diff chạm RLS, phiên, migration. Một lần cuối nhánh (`/finish`): `verifier-security` + `verifier-db`, chỉ nhận diff + mục spec (`13` §2/§4/§5, `10` §4, ADR 003). Xử lý "Chặn merge" nếu có.

## Rủi ro

- RLS bảng xác thực làm hỏng luồng đăng nhập → test mục 2; `db.auth` là pool riêng nên Better Auth không đổi cách gọi.
- `db.system` mất khả năng đọc bảng xác thực: mọi chỗ cũ (test, `revoke.ts`, `session.ts`) phải chuyển sang `withAuthContext` — typecheck + test sẽ lộ chỗ sót.
- Tham số khởi động `-c app.ctx=auth` của pool riêng: cần xác nhận Postgres nhận biến tùy chỉnh này (test kiểm).
- Ngữ cảnh DB (`app.*`) chống lỗi của mã, **không** chống kẻ đã chạy được SQL tùy ý (có thể tự `set`); như thiết kế `app.workspace_id`.

## Đề xuất thay đổi (spec)

- `docs/13` §5 (được phép): tách thành `| Mật khẩu, token mời | Hash (mật khẩu: argon2id) |` và `| Mã dự phòng 2FA | Mã hóa bởi plugin 2FA của Better Auth (XChaCha20-Poly1305, khóa dẫn xuất từ BETTER_AUTH_SECRET) — plugin không hỗ trợ lưu băm, chấp nhận 03/11 (ADR 003) |`.
- `docs/10` §4 (được phép): bullet `app.user_id` → "đã áp cho `users`/`sessions`/`accounts`/`verifications`; `two_factors` áp khi tạo bảng", ghi ngữ cảnh `app.ctx = 'auth'` và bảng ba ngữ cảnh.

## Thứ tự làm

T1 trigger + quyền cột (`0007`) → T2 ngữ cảnh `auth` + RLS (`0008`) + `client.ts` + chuyển test cũ → T3 `check-rls` → T4 `appEnv` + `readSession` → T5 `cf-dev-command` + logger → T6 Mailpit + `stack-check` + env → T7 docs → `/finish` (kiểm chứng một lần, PR, CI, merge giữ lịch sử).

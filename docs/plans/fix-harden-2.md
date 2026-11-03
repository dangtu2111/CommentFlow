# Kế hoạch — nhánh `fix/harden-2`

Việc: **HARDEN-2** + **AUTH-RLS-OWN** (gap matrix), kèm sửa `docs/13` §5 (được phép) và thêm **Mailpit** vào `cf-dev`.
Trạng thái duyệt: **CHỜ CHỦ DỰ ÁN DUYỆT** (chưa sửa code). Agent: claude. Tách nhánh từ `main` (`3f5d6de`).

## Tóm tắt (đọc trước)

Việc này siết nốt các lỗ hổng mà lần kiểm chứng độc lập thứ hai còn nêu: hạn 8 giờ của phiên Admin sẽ được **ép ngay trong database** (không còn phụ thuộc vào việc gọi đúng hàm), bảng đăng nhập/phiên/tài khoản sẽ có RLS "chỉ thấy dòng của mình", công cụ `check-rls` chặt hơn, và vài chỗ nhỏ (cookie Secure, rào lệnh `cf-dev`, log che bí mật). Thêm Mailpit (hộp thư giả cho môi trường dev) vào máy ảo để sau này thử email quên mật khẩu/lời mời. Rủi ro chính: RLS trên bảng xác thực có thể làm hỏng luồng đăng nhập nếu viết sai — nên có test chạy trên DB thật cho từng ngữ cảnh.

## File sẽ đọc (≤ 8, kèm lý do)

| File | Lý do |
|---|---|
| `packages/saas-core/src/auth/auth.ts`, `session.ts` | Sửa `appEnv`, đơn giản hóa `readSession` khi đã có trigger |
| `packages/db/src/check-rls.ts` (+ test) | Siết kiểm policy, thêm loại bảng "của chính mình" |
| `packages/db/migrations/0001`, `0004` (grep chính sách hiện có) | Viết policy mới nhất quán với policy cũ |
| `scripts/lib/cf-dev-command.mjs` (+ test) | Chặn cờ ngắn dính |
| `apps/worker/src/logger.ts` (+ test) | Thêm trường cần che |
| `infra/docker-compose.yml`, `docker-compose.dev.yml`, `scripts/stack-check.mjs` + `lib/stack-check.mjs` | Thêm Mailpit và kiểm cổng mới |
| `docs/13_Security_Design.md` §5 (dòng "Mật khẩu, mã dự phòng, token mời") | Tách dòng theo yêu cầu |
| Tài liệu Mailpit (WebFetch) | Xác nhận biến môi trường, health check, cổng |

## File sẽ sửa / tạo

| File | Nội dung |
|---|---|
| `packages/db/migrations/0007_admin_session_cap.sql` (mới, custom) | Trigger `BEFORE INSERT OR UPDATE ON core.sessions`: phiên `is_admin_session` có `expires_at ≤ created_at + 8 giờ`; `created_at` chỉ được lùi (không được dời muộn) |
| `packages/db/migrations/0008_own_row_rls.sql` (mới, custom) | RLS cho `users`, `sessions`, `accounts`, `verifications` (xem thiết kế dưới) |
| `packages/saas-core/src/auth/auth.ts` | `appEnv` bắt buộc, kiểu hợp (`dev`/`test`/`ci`/`staging`/`production`); chỉ dev/test/ci được tắt `Secure` |
| `packages/saas-core/src/auth/session.ts` | `readSession` giữ vai trò lớp thứ hai (trigger đã ép hạn); bỏ bước tự kéo hạn |
| `packages/db/src/check-rls.ts` | `every` thay `some` cho policy permissive; kiểm `WITH CHECK` của INSERT/UPDATE; `has_any_column_privilege`; lọc `polroles`; đối chiếu biểu thức chuẩn; thêm nhóm bảng "của chính mình" (`current_user_id()`) |
| `scripts/lib/cf-dev-command.mjs` | Chặn cờ ngắn gộp chứa `v`/`p`/`f` (`-pfoo`, `-fx.yml`, `-vt1`) |
| `apps/worker/src/logger.ts` | Thêm `access_token`, `refresh_token`, `api_key`, `client_secret`, `Authorization`, `err.config.headers.*`, `err.request.headers.*` |
| `infra/docker-compose.yml`, `docker-compose.dev.yml` | Dịch vụ `mailpit` (image ghim `axllent/mailpit:v1.33.0`, MIT) |
| `scripts/stack-check.mjs`, `scripts/lib/stack-check.mjs` (+ test) | Kiểm SMTP (banner `220`) và giao diện Mailpit |
| `env.example`, `infra/scripts/print-dev-env.sh` | Thêm `SMTP_HOST`, `SMTP_PORT`, `MAILPIT_URL` (không có bí mật) |
| `docs/13_Security_Design.md` §5 | Tách thành hai dòng theo lời chủ dự án |
| `docs/decisions/001-stack.md` §4 + `docs/codemap.md` + `docs/gap-matrix.md` | Bảng cổng (5 → 7), bẫy mới, đóng `HARDEN-2`/`AUTH-RLS-OWN` |

## Thiết kế AUTH-RLS-OWN (chỗ cần duyệt kỹ)

Gọi `ws = current_workspace_id()`, `u = current_user_id()`. Ba ngữ cảnh: **hệ thống** (cả hai NULL — Better Auth đọc theo email/token, job hệ thống), **người dùng** (`withUser`), **workspace** (`withWorkspace`).

| Bảng | Ngữ cảnh hệ thống | Ngữ cảnh người dùng (`u`) | Ngữ cảnh workspace (`ws`) |
|---|---|---|---|
| `sessions`, `accounts` (cột `user_id`) | thấy tất cả | chỉ dòng của mình | **không thấy dòng nào** (token phiên thô, băm mật khẩu không bao giờ lộ cho mã chạy theo workspace) |
| `users` | thấy tất cả | chỉ dòng của mình | chỉ người dùng là thành viên `active` của workspace đó (để sau này hiện danh sách thành viên) |
| `verifications` (mở rộng, xem câu hỏi) | thấy tất cả | thấy tất cả | không thấy |
| `two_factors` (chưa có bảng) | — | — | Khi tạo bảng phải có policy cùng mẫu `sessions`; `check-rls` đỏ nếu thiếu |

- Ghi (`WITH CHECK`): chỉ ở ngữ cảnh hệ thống hoặc đúng người dùng của dòng đó; không ghi được từ ngữ cảnh workspace.
- Chủ sở hữu bảng (`cf_owner`, migration) không bị ảnh hưởng (không `FORCE`).
- Quyền GRANT giữ nguyên; thay đổi chỉ là thêm policy.

## Migration

`0007` (trigger hạn phiên Admin) và `0008` (RLS bảng xác thực). Cả hai là **custom SQL** (không có thay đổi schema Drizzle). Đường lùi ghi ở đầu mỗi file. Áp lên `cf_dev`/`cf_test` bằng `pnpm db:migrate`; không đụng staging.

## Test viết trước (theo thứ tự)

1. **Trigger Admin** (DB thật): phiên Admin chèn với `expires_at = +14 ngày` → lưu `created_at + 8h`; Better Auth làm mới qua **`auth.api.getSession` gọi thẳng (không qua `readSession`)** → `expires_at` vẫn ≤ `created_at + 8h` và sau 8 giờ trả `null`; `created_at` không dời muộn được; phiên app (không Admin) không bị ảnh hưởng; hằng số SQL khớp `ADMIN_SESSION_SECONDS`.
2. **RLS bảng xác thực** (DB thật, từng ngữ cảnh ở bảng trên): hệ thống thấy hết; `withUser(a)` chỉ thấy dòng của a và không sửa được dòng của b; `withWorkspace(W)` không thấy `sessions`/`accounts`/`verifications`, chỉ thấy `users` là thành viên `active` của W (thành viên `removed`/`suspended` và người ngoài W thì không); không ghi được từ ngữ cảnh workspace. Toàn bộ test auth hiện có (đăng ký, đăng nhập, đổi mật khẩu, `readSession`) **vẫn xanh** — bằng chứng luồng Better Auth không bị hỏng.
3. **`check-rls`** (đơn vị với DB giả + tích hợp): hai policy (một đúng, một `USING (true)`) → đỏ; `WITH CHECK (true)` trên UPDATE → đỏ; quyền cấp theo cột thiếu policy → đỏ; policy `TO cf_owner` không được tính cho `cf_app`; biểu thức sai mẫu → đỏ; bảng "của chính mình" thiếu policy `current_user_id()` → đỏ.
4. **`createAuth`**: `appEnv` ngoài danh sách (`'prod'`, `undefined`) → `CONFIG_INVALID`; `Secure` tắt chỉ chấp nhận ở dev/test/ci.
5. **`cf-dev-command`**: `-pfoo`, `-fx.yml`, `-vt1`, `-dv` bị từ chối; `-d`, `--tail=50` vẫn qua.
6. **Logger**: `access_token`, `refresh_token`, `api_key`, `client_secret`, `Authorization`, `err.config.headers.*` bị che.
7. **`stack-check`**: hàm đọc banner SMTP (`220 …` đạt, khác thì lỗi).

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/db test && pnpm --filter @flow/db test:db
pnpm --filter @flow/saas-core test && pnpm --filter @flow/saas-core test:db
pnpm --filter @flow/worker test && pnpm --filter @flow/scripts test
pnpm lint && pnpm typecheck && pnpm depcruise
pnpm db:migrate && pnpm db:check-rls && pnpm cf:dev up -d && pnpm stack:check
```

## Mailpit (cf-dev)

- Image `axllent/mailpit:v1.33.0` (MIT, kho còn hoạt động); RAM dự kiến ~20–40 MB, `mem_limit: 128m`.
- **Cổng cần mở portproxy + tường lửa (chỉ cho `192.168.1.96`): `8025` (giao diện web) và `1025` (SMTP).** Tổng cổng publish của `cf-dev`: 5 → 7.
- Không đặt mật khẩu cho giao diện (chỉ dev, chỉ trong LAN, dữ liệu giả). SMTP không xác thực.
- Chưa có mã nào gửi email (làm ở `AUTH-FORGOT`); lần này chỉ dựng hạ tầng, biến môi trường và kiểm sức khỏe.
- Healthcheck theo tài liệu Mailpit (sẽ xác nhận khi làm); đo RAM thật bằng `pnpm cf:dev stats` và ghi vào `001-stack.md`.

## Cần kiểm chứng độc lập không?

**Có** — diff chạm RLS, phiên, migration. Một lần cuối nhánh: `verifier-security` + `verifier-db`, chỉ nhận diff + mục spec (`13` §2/§4/§5, `10` §4, ADR 003). Xử lý "Chặn merge" nếu có.

## Rủi ro / Cần bạn quyết định

1. **RLS cho `users`/`sessions`/`accounts`** như bảng thiết kế trên (workspace không thấy phiên/tài khoản; `users` chỉ thấy thành viên `active`). Đồng ý? Đây là chỗ có thể làm hỏng luồng Better Auth nếu sai; test mục 2 là lưới an toàn.
2. **Mở rộng `verifications`** (mã xác minh email/quên mật khẩu không thấy được từ ngữ cảnh workspace) — spec chỉ nêu bốn bảng; tôi đề xuất làm luôn vì cùng rủi ro. Đồng ý?
3. **Hạn 8 giờ ở DB** bằng trigger (đề xuất) thay vì ép mọi route qua `readSession`. `created_at` chỉ được lùi để test và vận hành vẫn rút ngắn được. Đồng ý?
4. **`appEnv` bắt buộc** trong `createAuth` (đổi chữ ký hàm; hiện chỉ test gọi).
5. **Mailpit không mật khẩu** trong LAN; hai cổng `8025`/`1025`. Đồng ý?
6. `docs/10` §4 hiện ghi "chưa áp" cho bốn bảng này; sau khi xong cần sửa thành "đã áp" — xem **Đề xuất thay đổi**.
7. Plan/handoff của `chore/scaffold` đã merge: đề xuất xóa `docs/plans/chore-scaffold.md` và `docs/handoff/chore-scaffold.md` ở cuối nhánh này (việc còn mở đã nằm trong gap matrix). Đồng ý?

## Đề xuất thay đổi (spec — chờ cho phép)

- `docs/10_Database_Design.md` §4, bullet "Ngữ cảnh người dùng `app.user_id`": đổi phần *Trạng thái* từ "chưa áp cho `users`/`sessions`/`accounts`/`two_factors`" sang "đã áp cho `users`/`sessions`/`accounts`/`verifications`; `two_factors` áp khi tạo bảng", và ghi ba ngữ cảnh (hệ thống / người dùng / workspace) như bảng thiết kế. **Cần bạn cho phép sửa đúng đoạn này.**
- `docs/13_Security_Design.md` §5 (đã được cho phép): thay dòng `| Mật khẩu, mã dự phòng, token mời | Hash |` bằng hai dòng `| Mật khẩu, token mời | Hash (mật khẩu: argon2id) |` và `| Mã dự phòng 2FA | Mã hóa bởi plugin 2FA của Better Auth (XChaCha20-Poly1305, khóa dẫn xuất từ BETTER_AUTH_SECRET) — plugin không hỗ trợ lưu băm, chấp nhận 03/11 (ADR 003) |`.

## Thứ tự làm sau khi duyệt

T1 trigger Admin → T2 RLS bảng xác thực → T3 `check-rls` → T4 `appEnv` + `readSession` → T5 `cf-dev-command` + logger → T6 Mailpit + `stack-check` + env → T7 docs (`13` §5, ADR, codemap, gap matrix) → `/finish` (kiểm chứng một lần, PR, CI, merge giữ lịch sử).

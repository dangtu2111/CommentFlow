# Kế hoạch `feat/auth-ui` — giao diện + luồng xác thực GĐ0

## Việc

Mã gap matrix: `UI-AUTH`, `AUTH-FORGOT` (trừ kiểm mật khẩu lộ), `DESIGN-TOKENS`, `HARDEN-3` mục (c). Spec: FR-001…005, FR-119 (`05`), `08` §2 §6 §8, `13` §2, `16` §3 GĐ0.

**Tóm tắt (đọc phần này trước).** Nhánh này dựng 6 trang đăng ký / xác minh email / đăng nhập / đăng xuất / quên mật khẩu / đặt lại mật khẩu bằng tiếng Việt và tiếng Anh, gửi email thật qua một lớp `notify` (lớp gửi thông báo) dùng SMTP (dev: Mailpit), và thu hẹp cột `users` mà `cf_app` đọc được. Vì sao: lõi xác thực đã xong nhưng chưa có giao diện nên chưa ai dùng được. Rủi ro chính: (1) chống lộ "email có tồn tại không" phải đúng cả ở đăng ký, đăng nhập, quên mật khẩu (kể cả thời gian phản hồi); (2) Stitch chỉ vẽ **một** màn hình (đăng nhập/đăng ký), thiếu 4 màn và email; (3) endpoint đăng nhập lộ ra ngoài khi chưa có rate limit — nhánh này chỉ mở đúng 2 đường GET của Better Auth và chỉ chạy dev.

## Phạm vi và cách làm

- **Luồng** (đều là Server Action gọi `saas-core`, không gọi Better Auth trực tiếp từ trình duyệt):
  - Đăng ký → trang "Kiểm tra email" (có nút gửi lại) → bấm link → `/api/auth/verify-email` → về `/login?verified=1`. Chưa xác minh thì **không đăng nhập được** (`requireEmailVerification`).
  - Đăng nhập → `/app` (trang tạm: lời chào + nút Đăng xuất; onboarding/workspace là nhánh sau). Đăng xuất xóa phiên + cookie.
  - Quên mật khẩu (luôn trả cùng một thông báo) → email → link → `/reset-password?token=…` → đặt mật khẩu mới → mọi phiên bị thu hồi (đã có `revokeSessionsOnPasswordReset`) → `/login`.
- **Không lộ email có tồn tại hay không:** thông báo đăng ký/quên mật khẩu luôn như nhau; đăng ký trùng email thì gửi thư "đã có tài khoản, hãy đăng nhập hoặc đặt lại mật khẩu" thay vì báo lỗi; đăng nhập sai chỉ nói "Email hoặc mật khẩu không đúng"; email gửi **không chờ** (không `await`) để thời gian phản hồi không khác nhau. Logic này nằm trong `saas-core/src/auth/flows.ts` để test được không cần giao diện.
- **Chừa chỗ 2FA + rate limit:** kết quả đăng nhập là một kiểu có sẵn các nhánh `two_factor_required` và `rate_limited` (giao diện + chuỗi vi/en đã có, chưa có đường nào sinh ra chúng); hàm `loginGate({ip, email})` hiện luôn cho qua, nhánh sau gắn Valkey vào đó mà không đổi luồng.
- **Design tokens (`08` §2):** `apps/web/src/styles/tokens.css` (biến CSS sáng/tối đúng bảng §2.1, thang chữ/khoảng cách/bo góc §2.2) + font Be Vietnam Pro tự host. Màu/chữ trong code chỉ lấy từ token.
- **Trang đăng nhập/đăng ký theo `design/stitch/auth-login-register.png`** (2 tab, thẻ bên phải, panel giới thiệu bên trái, chọn ngôn ngữ ở góc). Các trang còn lại dựng cùng khung thẻ.
- **Email:** `saas-core/src/notify/` gồm giao diện `MailTransport`, transport SMTP (thư viện `nodemailer`), bộ mẫu thư vi/en cho "xác minh email", "đặt lại mật khẩu", "đã có tài khoản". Ngôn ngữ thư = `users.locale`; người đăng ký chọn ngôn ngữ ở form (`locale` cho nhận từ form, đã có CHECK `vi|en` ở DB).
- **HARDEN-3 (c):** migration `0012` thu hẹp quyền SELECT của `cf_app` trên `users` xuống `id, email, name, image, locale, created_at, updated_at` (không còn `is_admin`, `admin_role`, `email_verified`, `totp_enabled`); thêm `tenancy.listMembers(workspaceId)` chỉ trả `userId, name, email, image, role, status`. Thông tin "tôi đã xác minh chưa / có bật 2FA / có phải Admin" lấy từ phiên Better Auth (role `cf_auth`), không từ `cf_app`.

## File sẽ đọc (≤ 8, kèm lý do)

1. `apps/web/src/app/page.tsx` — trang hiện tại, xem cách dùng i18n.
2. `apps/web/src/components/locale-switcher.tsx` — tái dùng bộ chọn ngôn ngữ.
3. `apps/web/src/i18n/messages.ts` (+ `messages.test.ts`) — cách nạp `vi.json`/`en.json`.
4. `packages/shared/src/i18n/message-utils.ts` + hai file `vi.json`/`en.json` — cấu trúc khóa, test khớp khóa.
5. `packages/saas-core/src/index.ts` — chỗ xuất API cho `apps/web`.
6. `packages/shared/src/env.ts` (hoặc nơi có `parseEnv`) — mẫu đọc biến môi trường bằng Zod.
7. Kiểu của Better Auth 1.7.15 (`emailVerification`, `sendResetPassword`, `requireEmailVerification`, `nextCookies`) — lấy bằng `npm pack` vào thư mục tạm vì `node_modules` bị chặn đọc.
8. `design/stitch/auth-login-register.png` — **đã xem** (chỉ trang này).

Đã đọc khi lập kế hoạch (dùng lại, không đọc lại): `08` §2 §4 §6 §8, `13` §2, `05` FR-001…005/119, `design/stitch/README.md`, `apps/web/{layout.tsx,actions.ts,package.json,eslint.config.mjs,i18n/request.ts}`, `packages/saas-core/src/auth/*`, `tenancy.ts`, `docs/codemap.md`.

## File sẽ tạo / sửa

| File | Việc |
|---|---|
| `packages/db/migrations/0012_users_select_columns.sql` | Thu hẹp SELECT `users` của `cf_app` theo cột |
| `packages/db/src/check-rls.ts` (+ test) | Cấm `cf_app` SELECT `users.is_admin/admin_role/email_verified/totp_enabled` |
| `packages/saas-core/src/tenancy/tenancy.ts` | Thêm `listMembers` chỉ trả cột cần |
| `packages/saas-core/src/notify/{transport.ts,smtp.ts,templates.ts,index.ts}` | Lớp notify: giao diện, SMTP, mẫu thư vi/en |
| `packages/saas-core/src/auth/{auth.ts,flows.ts,index.ts}` | Bật xác minh email + quên mật khẩu (nhận `notifier`), `registerAccount`, `signIn`, `requestPasswordReset`, `resetPassword`, `resendVerification` trung tính, `loginGate` |
| `packages/saas-core/package.json`, `pnpm-lock.yaml` | Thêm `nodemailer` |
| `apps/web/src/styles/{tokens.css,globals.css}` | Design tokens + nền tảng kiểu |
| `apps/web/src/components/ui/*` | Button, Field, PasswordField (nút hiện/ẩn), Banner, AuthCard, Tabs — chỉ những gì 6 trang cần |
| `apps/web/src/app/(auth)/{login,register,check-email,forgot-password,reset-password}/page.tsx` + `actions.ts` | 5 trang auth + Server Action |
| `apps/web/src/app/(auth)/verify-email/page.tsx` | Kết quả xác minh (thành công / link hết hạn → gửi lại) |
| `apps/web/src/app/app/page.tsx` | Trang tạm sau đăng nhập + Đăng xuất |
| `apps/web/src/app/api/auth/[...all]/route.ts` | Chỉ cho GET `verify-email` và `reset-password/*`; mọi đường khác 404 |
| `apps/web/src/server/{env.ts,auth.ts}` | Gốc lắp ráp: đọc env, mở pool `cf_auth`, tạo `auth` + `notifier` (một lần) |
| `apps/web/src/lib/auth-messages.ts` (+ test) | Ánh xạ mã lỗi → khóa chuỗi theo `08` §6 (thuần, test được) |
| `packages/shared/src/i18n/{vi,en}.json` | Chuỗi `auth.*`, `email.*` (khớp khóa) |
| `apps/web/package.json` | `@flow/saas-core`, `zod`, `@fontsource/be-vietnam-pro` |
| `env.example`, `infra/scripts/print-dev-env.sh` | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_AUTH_URL` (đã có), `SMTP_FROM` |
| `docs/gap-matrix.md`, `docs/codemap.md`, `docs/handoff/feat-auth-ui.md` | Cập nhật cuối nhánh |

## Migration

`0012_users_select_columns.sql`: `REVOKE SELECT ON core.users FROM cf_app; GRANT SELECT (id, email, name, image, locale, created_at, updated_at) ON core.users TO cf_app;`. Giữ nguyên policy. Không đổi `cf_auth`. Đường lùi: `GRANT SELECT ON core.users TO cf_app`.

## Test viết trước (logic quy tắc)

- **saas-core (tích hợp, chạy trên CI):** đăng ký gửi đúng 1 thư xác minh; chưa xác minh → đăng nhập bị từ chối; xác minh xong → đăng nhập được; đăng ký trùng email **trả đúng kết quả như đăng ký mới** và gửi thư "đã có tài khoản"; quên mật khẩu với email lạ trả cùng kết quả và **không** gửi thư; token đặt lại dùng được **một lần**, hết hạn bị từ chối; sau đặt lại: mật khẩu cũ sai, mới đúng, mọi phiên cũ mất; mật khẩu < 10 ký tự bị từ chối; thư theo `users.locale`.
- **saas-core (đơn vị):** mẫu thư vi/en có link và không in token ra log; `loginGate` mặc định cho qua; transport SMTP dựng đúng tham số (dùng `streamTransport` của nodemailer). Một test gửi thật tới Mailpit chỉ chạy khi có `TEST_SMTP_HOST` (CI không có Mailpit → bỏ qua có ghi lý do).
- **db (tích hợp):** `cf_app` không SELECT được `users.is_admin/admin_role/email_verified/totp_enabled` (từ chối quyền), vẫn đọc được 7 cột cho phép; `listMembers` chỉ trả đúng 6 trường; `check-rls` bắt khi ai cấp lại.
- **web (đơn vị):** `auth-messages` (mọi mã lỗi Better Auth → khóa chuỗi có trong vi/en, không có mã nào lộ "email không tồn tại"); schema Zod của form; route `/api/auth/*` chặn mọi đường ngoài 2 đường cho phép.
- **Thủ công (sau khi bạn cập nhật `.env`):** dev server + Mailpit: đi hết 6 luồng ở cả hai ngôn ngữ, chụp màn hình so với PNG.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/saas-core exec vitest run src/notify src/auth
pnpm --filter @flow/saas-core test:db          # CI; local cần TEST_DATABASE_AUTH_URL
pnpm --filter @flow/web test && pnpm lint:i18n
pnpm --filter @flow/db exec vitest run src/check-rls.test.ts
pnpm lint && pnpm typecheck && pnpm depcruise
```

## Cần kiểm chứng độc lập không?

**Có** (auth, phiên, token, che PII, migration RLS): `verifier-security` + `verifier-db` một lần cuối nhánh, trên **diff nhánh này cộng diff migration 0011** (policy `users_auth_no_admin_insert`, viết lại trigger `cap_admin_session`, handle mờ `openAuthDb`, kiểm cột của `check-rls` — các thay đổi sau lần kiểm chứng thứ hai chưa được kiểm lần hai).

## Rủi ro / điểm cần lưu ý

| Rủi ro | Cách giảm |
|---|---|
| Lộ email tồn tại (nội dung, mã HTTP, **thời gian** phản hồi) | Cùng thông báo + cùng mã; gửi thư không chờ; test so sánh hai nhánh; Better Auth đã băm giả khi email lạ — sẽ kiểm bằng test |
| Hành vi thật của Better Auth 1.7.15 khi đăng ký trùng email với `requireEmailVerification` có thể khác tài liệu | Test đi trước; nếu khác thì `flows.ts` tự chặn (kiểm email trước bằng `cf_auth`) |
| `GET /api/auth/*` công khai khi chưa có rate limit | Chỉ 2 đường GET được bật, đăng nhập/đăng ký chỉ qua Server Action; **chưa deploy** ra ngoài cho tới `AUTH-RATELIMIT` |
| Token trong URL thư bị lộ qua log/Referer | Link dùng một lần, hết hạn 1 giờ (đặt lại) / 24 giờ (xác minh); trang đặt lại gửi `Referrer-Policy: no-referrer`; log không in URL |
| Thu hẹp cột `users` làm hỏng truy vấn `select()` toàn cột của `cf_app` | Đã rà: chỉ test và `tenancy` dùng; sửa sang chọn cột tường minh trong cùng nhánh |
| `nodemailer` (MIT-0) + `@fontsource/be-vietnam-pro` (OFL-1.1) + `zod` (MIT, đã có trong repo) là phụ thuộc mới ở một số gói | Nêu lý do ở "Cần bạn quyết định" #4 |
| Stitch ≠ yêu cầu (xem #1, #3) | Chờ bạn chốt |

## Đề xuất thay đổi

Không sửa `docs/01–16`. Đề xuất bằng lời: bổ sung vào `08` §4 dòng "Công khai" các trang `verify-email`, `forgot-password`, `reset-password`, `check-email` (hiện chỉ ghi "đăng nhập").

## Cần bạn quyết định

Mỗi mục có khuyến nghị; không trả lời thì tôi dùng khuyến nghị.

1. **Màn hình Stitch có thứ chưa có trong GĐ0 và số liệu bịa.** Ảnh có nút "Tiếp tục với Facebook/Google", ô "Ghi nhớ đăng nhập 30 ngày", huy hiệu "Meta Tech Partner Certified", thống kê "500+ shop, 98.6%, 18 giờ", "Dùng thử 14 ngày". *Khuyến nghị:* **bỏ** các thành phần này (không có OAuth đăng nhập ở GĐ0; phiên cố định 14 ngày theo `13` §2; không tạo số liệu/chứng nhận giả — AGENTS.md "Cấm"); giữ bố cục 2 cột, tab, thẻ, chọn ngôn ngữ, câu giới thiệu sản phẩm không có số liệu.
2. **Thiếu 4 màn hình + email** (xác minh email, quên mật khẩu, đặt lại mật khẩu, kiểm tra email, thư xác minh/đặt lại): Stitch chưa vẽ. *Khuyến nghị:* tôi dựng cùng khung thẻ và token của trang đăng nhập, bạn xem rồi nhờ vẽ lại nếu cần; chưa gọi `/stitch-sync` (không có màn mới để tải).
3. **Màu nút chính:** Stitch dùng `#005868` (đậm hơn), `08` §2 là `#0B7285`. *Khuyến nghị:* theo `08` §2 (bạn đã yêu cầu token từ `08`); bảng "Khác biệt với bảng thương hiệu" trong `design/stitch/README.md` giữ nguyên chờ bạn chốt.
4. **Thư viện mới:** `nodemailer` (gửi SMTP, MIT-0, ~ chuẩn công nghiệp, tự viết SMTP là rủi ro), `@fontsource/be-vietnam-pro` (tự host font, OFL-1.1, tránh `next/font/google` gọi mạng lúc build), `zod` thêm vào `apps/web` (đã dùng ở gói khác). Icon: vẽ SVG nội tuyến (không thêm `lucide-react`). Đồng ý?
5. **Kiểm mật khẩu lộ (`13` §2, `AUTH-FORGOT`):** cần gọi dịch vụ Have I Been Pwned (gửi 5 ký tự đầu của băm, không gửi mật khẩu). *Khuyến nghị:* **hoãn** sang nhánh riêng, ghi vào gap matrix (đây là gọi ra ngoài, cần bạn duyệt riêng). Đồng ý hoãn?
6. **Đăng ký trùng email:** gửi thư "bạn đã có tài khoản" cho địa chỉ đó (chuẩn chống dò email) thay vì báo lỗi. Đồng ý? (Đổi lại: người gõ nhầm email cũ không thấy lỗi ngay trên màn hình.)
7. **Điểm đến sau đăng nhập:** `/app` là trang tạm; workspace/onboarding làm nhánh sau. Đồng ý?
8. **Cột `users` của `cf_app` thu hẹp** nên `withUser` không đọc được `email_verified`, `totp_enabled`, `is_admin` của chính mình — các giá trị này lấy từ phiên Better Auth. Đồng ý?
9. **Việc bạn cần làm trước khi chạy thử thủ công:** thêm vào `.env` (máy code) `BETTER_AUTH_SECRET` (tự sinh: `openssl rand -hex 32`, **không** để trên máy ảo — `13` §2) và chạy lại `ssh cf "~/CommentFlow/infra/scripts/print-dev-env.sh" > .env` (agent không chạy). Test tích hợp vẫn chạy trên CI.

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11), kèm điều chỉnh: (1) bỏ OAuth, ghi nhớ, huy hiệu, số liệu; (2) dựng màn thiếu cùng khung/token; (3) nút chính #0B7285, ghi khác biệt Stitch vào ; (4) nodemailer, @fontsource/be-vietnam-pro, zod, **lucide-react (ISC)** thay SVG tự chép; (5) kiểm mật khẩu lộ chuyển sang nhánh 2FA + rate limit, phải xong trước cổng 0 (ghi gap matrix); (6) đăng ký trùng email gửi thư 'đã có tài khoản', giao diện giống đăng ký mới; (7) /app tạm; (8) email_verified/totp_enabled/is_admin chỉ lấy từ phiên phía server; (9) BETTER_AUTH_SECRET đọc từ  (người dùng tạo); web, worker và script nạp  SAU  để chạy lại print-dev-env.sh không mất khóa.

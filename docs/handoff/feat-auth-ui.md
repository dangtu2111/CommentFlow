# Bàn giao — nhánh `feat/auth-ui`

Cập nhật: 2026-11-03 · Mục gap matrix: UI-AUTH, AUTH-FORGOT, DESIGN-TOKENS, HARDEN-3 (c) · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-auth-ui.md` (đã duyệt 03/11 kèm 9 điều chỉnh của chủ dự án)

## Đã làm
- **DB (0012):** `cf_app` chỉ SELECT 7 cột `users`; `check-rls` cấm đọc `is_admin/admin_role/email_verified/totp_enabled`; `tenancy.listMembers` trả 5 trường. `@flow/db/runtime` là cửa hẹp cho web/saas-core.
- **notify (saas-core):** `MailTransport` (SMTP/nodemailer + bộ nhớ cho test), mẫu thư vi/en, `createNotifier` (gửi nền, lỗi đã lọc).
- **auth (saas-core):** xác minh email bắt buộc, quên/đặt lại mật khẩu, `onExistingUserSignUp` gửi thư "đã có tài khoản"; `flows.ts` trả kết quả trung tính (register, signIn, resendVerification, requestPasswordReset, resetPassword, signOut), `loginGate` (chừa chỗ rate limit), nhánh `two_factor_required` (chừa chỗ 2FA); `cookies.ts` tách `Set-Cookie`.
- **web:** `styles/tokens.css` (08 §2), 7 trang (login, register, check-email, verify-email, forgot-password, reset-password, `/app` tạm), Server Action, `/api/auth/*` chỉ 2 đường GET, `server/{env,auth,session}.ts`, ngôn ngữ mặc định theo Accept-Language, header bảo mật.
- **env:** `scripts/lib/load-env.mjs` nạp `.env.local` sau `.env` (web, worker, script, test); `env.example`, `print-dev-env.sh` thêm `SMTP_FROM`, `BETTER_AUTH_URL`.
- **Kiểm thật:** `e2e-auth.mjs` (scratchpad, không commit) 27/27 trên cf_dev + Mailpit; đã xóa tài khoản thử.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| Better Auth 1.7.15 (tài liệu) | `requireEmailVerification` → đăng ký trùng email trả 200 như email mới + `onExistingUserSignUp`; đăng nhập chưa xác minh = 403; email xác minh KHÔNG dùng một lần (JWT), thư đặt lại thì dùng một lần |
| Next 16 | Server Action file chỉ xuất hàm async; `useActionState` reset form → trả `values` để điền lại; tự sinh `apps/web/AGENTS.md` (đã tắt `agentRules:false`); Turbopack lỗi nếu import `@flow/db` gốc (migration) |
| `eslint-plugin-i18next` | `jsx-only` + `jsx-attributes.exclude` **thay** (không cộng) danh sách miễn mặc định; cấu hình ở `apps/web/eslint.config.mjs` |
| Stitch | Chỉ có `auth-login-register.png`; các màn khác dựng tạm (README Stitch đã ghi) |

## Quyết định đã chốt trong phiên
- Bỏ OAuth/"ghi nhớ"/huy hiệu/số liệu; nút chính `#0B7285`; `lucide-react`, `nodemailer` (MIT-0), `@fontsource/be-vietnam-pro` (OFL-1.1), `zod`.
- Kiểm mật khẩu lộ → `AUTH-PWNED`, làm cùng nhánh 2FA + rate limit, phải xong trước cổng 0.
- Đăng ký trùng email → thư "đã có tài khoản"; `/app` tạm; `BETTER_AUTH_SECRET` ở `.env.local`.

## Còn lại (theo thứ tự)
1. Chạy `verifier-security` + `verifier-db` (diff nhánh + diff migration 0011), sửa "Chặn merge".
2. PR → CI xanh → merge giữ lịch sử → xóa nhánh/plan/handoff (chờ chủ dự án).
3. Nhánh sau: 2FA + rate limit (gắn vào `loginGate`, nhánh `two_factor_required`) + `AUTH-PWNED`; bộ chuyển workspace; vẽ lại màn Stitch còn thiếu; production: chọn nhà cung cấp email, thêm `SMTP_*`, role `cf_auth`.

## Lệnh test liên quan
```
pnpm --filter @flow/saas-core exec vitest run src/notify src/auth
pnpm --filter @flow/saas-core test:db      # cần TEST_DATABASE_AUTH_URL
pnpm --filter @flow/web test && pnpm lint:i18n && pnpm --filter @flow/web build
pnpm --filter @flow/db test:db && pnpm db:check-rls
```

# Bàn giao `feat/dev-auto-login` (agent: Claude Code)

## Đã làm
- Route chỉ-dev `GET /dev/login[?next=/app/...]` (`apps/web/src/app/dev/login/route.ts`) tạo phiên thật cho Owner mẫu `[MẪU] Demo Shop` bằng `internalAdapter.createSession` + cookie ký HMAC-SHA256 (định dạng Better Auth) + cookie workspace; redirect 303.
- Hàm quyết định thuần `server/dev-auto-login.ts` (+ test 45 ca): NODE_ENV != production, APP_ENV = dev, `DATABASE_URL` và `DATABASE_AUTH_URL` đều DB `cf_dev` (không tham số truy vấn), `DEV_AUTO_LOGIN=1`, Host loopback, không header proxy; `?next=` chỉ `/app...`. Sai → 404 trống.
- Seed đặt `totp_enabled = true` cho Owner mẫu (cả khi workspace mẫu đã có) để cổng 2FA cho qua; cổng `requireAppUser`/`decideAppAccess` KHÔNG đổi.
- `env.example`: `DEV_AUTO_LOGIN=` (trống = tắt).

## File đã đọc + điều rút ra
- `requireAppUser` → `twoFactor.principal` → Owner bắt buộc `totp_enabled`, nếu không redirect `/app/security`.
- `AuthHandle` mờ: web không có `.db`, nên không ghi trực tiếp `users`; vì vậy 2FA đánh dấu ở seed (role admin).
- Mật khẩu Owner mẫu ngẫu nhiên, chỉ in một lần → route không thể dùng mật khẩu, phải tạo phiên qua adapter.

## Chưa kiểm được / việc còn lại
- Chưa chạy trọn vòng trên DB `cf_dev` thật (worktree không có `.env`). Chủ dự án thử: `pnpm dev:seed-demo` (không `--reset`; đánh dấu 2FA), đặt `DEV_AUTO_LOGIN=1` vào `.env`, khởi động lại web, mở `http://localhost:3000/dev/login`.
- Chưa thử `next build` + gọi route ở production (khóa NODE_ENV đã có test bảng).

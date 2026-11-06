# Handoff `feat-settings-page` (claude, làn a)

## Đã làm
- `/app/settings` (trong `(guarded)`, mọi vai trò): `TwoFactorCard` + `SessionsCard` (tách từ `/app/security`) + `LanguageCard` (cookie).
- Menu `security` → `settings` (`lib/app-nav.ts`), khóa i18n `settings.*`, `shell.nav.settings`; test `app-nav.test.ts` (mã FR-001, FR-119 → xóa khỏi trace-baseline).
- `/app/security` giữ làm trang bắt buộc bật 2FA ngoài khung (QS1).

## Đã đọc + rút ra
- Cổng 2FA chuyển Owner/Admin chưa bật 2FA tới `/app/security` (`server/app-access.ts`); trang đó không được chuyển hướng đi sau khi bật vì state mã dự phòng nằm ở client.
- `SubmitButton` không nhận `name/value` → thẻ ngôn ngữ dùng `<button>` thường.

## Còn lại
- AUTH-CHANGE-PW-UI (đổi mật khẩu, nhạy cảm → verifier-security), AUTH-LANG-PREF (`users.locale` qua `auth.api.updateUser`, field `locale` `input: true`), khối thông tin tài khoản/cấu hình workspace của Stitch.
- Không chạy E2E/trình duyệt ở nhánh này (chỉ typecheck/test đơn vị); KT-016 chờ chủ dự án bấm tay.

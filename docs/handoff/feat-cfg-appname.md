# Bàn giao `feat-cfg-appname` (claude, làn a)

## Đã làm
- `@flow/shared`: `brand.ts` (`loadBrandConfig`, `defaultMailFrom`, `DEFAULT_BRAND`) + test.
- `saas-core`: `renderEmail(..., {brandName})`, `createNotifier({brandName})`, `createAuth({appName})` (issuer 2FA).
- Web: `server/brand.ts` (`getBrand`), `components/brand-logo.tsx`, `loadServerEnv` trả `brand` + `mailFrom` (`SMTP_FROM` giờ tùy chọn), tiêu đề 15 trang, chân trang; bỏ khóa i18n `brand`.
- Docs: QAN1, CAN_BAN_CUNG_CAP §2b, KT-016, codemap, gap-matrix, MASTER; `env.example` thêm 4 tên biến.

## Đã đọc và rút ra
- Tên cứng chỉ ở: `notify/templates.ts`, `auth.ts` (issuer), JSON i18n `brand` (3 chỗ) + `footer.rights`. Worker không gửi thư nên không đụng.
- Heredoc/sed bị công cụ chặn trong phiên này; dùng Edit.

## Còn lại
- Khi chốt Q6: đặt `APP_*` trong `.env`/staging. Landing/điều khoản = PUBLIC-PAGES.
- `infra/env.cf-staging.example` còn ví dụ `SMTP_FROM` cũ (vẫn hợp lệ).
- Chưa chạy E2E (cần máy ảo); KT-016 chờ bấm tay.

# Handoff `feat-auth-lang-pref` (claude, làn a)

## Đã làm
AUTH-LANG-PREF (FR-119): `tenancy.setUserLocale` (withUser, không migration), `apps/web/src/server/locale-choice.ts` (`applyLocaleChoice`), `setLocale` gọi nó; thẻ ngôn ngữ ở `/app/security` (khóa `auth.security.language.*`). Test: `tenancy-locale.test.ts`, `tenancy.int.test.ts`, `locale-choice.test.ts`. Docs: Q-LANG-1, KT-016, gap-matrix, MASTER, codemap.

## Đã đọc và rút ra
- `cf_app`/withUser chỉ GHI `users.name/image/locale` (0010); đăng nhập đã đặt cookie từ `users.locale` (flows.ts).
- Lint i18n chỉ chấp nhận hàm dịch tên `t`; dùng namespace `auth.security` thay vì thêm translator thứ hai.

## Còn lại
- Chủ dự án chạy KT-016. SETTINGS-PAGE sẽ chuyển thẻ ngôn ngữ vào trang Cài đặt hợp nhất.
- Test tích hợp `CF_LANE=a pnpm test:db` chưa chạy được nếu máy phụ tắt (xem báo cáo PR).

# Handoff `feat-wire-settings-security` (claude, làn a)

## Đã làm
- Email báo đổi mật khẩu (`password-changed`, vi/en) qua hook `onChanged` của `createChangePasswordFlow`, lắp ở `server/auth.ts` (gửi nền).
- Màn công khai `/password-changed` (Stitch `settings-password-changed`); `changePasswordAction` chuyển tới đó thay vì `/login`.
- Nhật ký kiểm toán `security.*` (`lib/security-audit.ts` + `server/security-audit.ts` → `writeActionLog` trong `withActor`) cho đổi mật khẩu, bật/tắt 2FA, tạo lại mã dự phòng, thu hồi phiên, đăng xuất thiết bị khác; nhãn dịch ở trang Nhật ký.
- Test: `change-password.test.ts`, `notify.test.ts`, `security-audit.test.ts`, `packages/db/tests/security-audit.int.test.ts` (cần DB, chưa chạy ở máy này), E2E `e2e/tests/settings-security.spec.ts` (chưa chạy: cần web + Mailpit + DB test; mới typecheck).

## Đã đọc và rút ra
- Phần lớn chức năng đã nối từ trước: đổi mật khẩu (độ dài → trùng cũ → rate limit → pwned → Better Auth → xóa phiên), 2FA (`two-factor.ts`), phiên thật (`overview`/`revokeSession`/`revokeOtherSessions`), ngôn ngữ (`setLocale` → `users.locale`), Owner/Admin không tắt được 2FA (`isRequiredFor`).
- Mã KT `KT-WSS` đã thuộc FR-005-SEARCH → dùng `KT-WSEC`.

## Còn lại
- Chạy E2E + `pnpm test:db` ở máy có hạ tầng; KT-WSEC chờ chủ dự án.
- Hoãn: số mã dự phòng còn lại (n/8), chế độ Tối, IP/vị trí phiên, nhật ký cho người dùng chưa có workspace.

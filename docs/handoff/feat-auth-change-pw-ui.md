# Bàn giao `feat-auth-change-pw-ui` (agent: claude, làn a)

## Đã làm
- Plan tự duyệt `docs/plans/feat-auth-change-pw-ui.md`; quyết định QPW1.
- `createChangePasswordFlow` (saas-core) + test; `changePasswordAction`, `lib/change-password-form.ts` (Zod), `ChangePasswordCard`; chuỗi vi/en; gỡ FR-001 khỏi `trace-baseline.json`.
- Docs: gap-matrix, MASTER, codemap, KIEM_TRA_TAY KT-015.

## Đã đọc và rút ra
- `revoke.ts`: `changePasswordAndRevokeAll` cần cookie phiên; Better Auth tự kiểm mật khẩu hiện tại.
- Bộ đếm `reauth` (5/15 phút theo userId) dùng chung với bật/tắt 2FA.
- Trang `/app/security` nằm ngoài `(guarded)` (Owner chưa bật 2FA vẫn vào được); `SECURITY_ACCESS` = `workspace optional, twoFactor skip`.
- Tên `vitest` chỉ chạy qua `pnpm --filter <gói> test <file>` (không `exec vitest`).

## Còn lại
- verifier-security: không có "Chặn merge"; đã sửa 2 mục "Nên sửa" (xóa phiên lỗi sau khi đổi → thử lại, vẫn ok; map INVALID_PASSWORD/401; cause không chứa thông báo gốc). Còn mở (ghi chú): ghi vào ADR 004 §1/§3 việc dùng chung xô `reauth` và kiểm HIBP khi đổi mật khẩu.
- `SETTINGS-PAGE` sẽ chuyển thẻ này vào trang Cài đặt.

# Handoff `feat-admin-shell-db` (claude, làn b)

## Đã làm
ADMIN-SHELL phần DB (FR-100, FR-118, AUTH-ADMIN-SESSION), Q-ADSH1, migration 0061:
- `@flow/shared/admin-audit.ts`: `evaluateAdminSession` (≤ 8 giờ), `canViewAdminAudit` (Super), `canRecordAdminAction`, `parseAdminAuditInput` (che PII/token). Test + property-based.
- `0061_admin_shell.sql`: bảng `core.admin_audit_log` chỉ-thêm (trigger), RLS không policy; hàm DEFINER `require_admin_session`, `admin_session_status`, `record_admin_action`, `admin_list_audit`.
- `@flow/db/queries/admin-audit.ts` (CF401 → `UNAUTHENTICATED`), `check-rls.ts` (bảng Admin-only, 4 hàm, trigger).
- `pnpm test:db` đầy đủ xanh (828 test, gồm check-rls int); `admin-audit.int.test.ts` 16 test.

## Đã đọc và rút ra
- Mẫu hàm DEFINER Admin: 0059 (`cf.assert_super_admin`), 0060 (`core.assert_billing_admin`). Phiên Admin: trigger `core.cap_admin_session` (0007/0009).
- Role LOGIN mới (mẫu `cf_worker`, 0030) cần superuser tạo role → không làm trong migration.
- `pnpm db:check-rls` ở worktree không có `.env` nên không chạy được tay; đã được phủ bởi `tests/check-rls.int.test.ts` trong `pnpm test:db`.
- Lint: lỗi `pnpm lint` còn lại nằm ở file ngoài phạm vi (có sẵn trên main).

## Còn lại
- `ADMIN-SHELL-ROLE` (role `cf_admin`), `ADMIN-SHELL-WIRE` (middleware, gọi `recordAdminAction` ở thao tác Admin, trang Nhật ký), giao diện Admin.

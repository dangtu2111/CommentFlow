# Bàn giao `feat-test-coverage-gap` (claude)

**Đã làm:** 6 file test đơn vị mới cho `saas-core` (tenancy, pg-errors, action-log, session+revoke, valkey, guard của workspace-admin); coverage câu lệnh/nhánh/hàm/dòng 52/49/49/54 → 61/54/63/63; ngưỡng CI nâng 41/40/39/41 → 63/61/63/53.
**Rút ra:** `AuthHandle` mờ — test dùng `wrapAuthDb` với AuthDb giả; `workspace-admin` cần hàng đợi `select` giả theo thứ tự.
**Còn lại:** `auth/flows.ts`, `auth/two-factor.ts`, `auth/auth.ts`, phần lớn `workspace-admin.ts` (đường thành công/mời/chấp nhận), `ratelimit/valkey.ts` (hàm tạo Redis thật), `notify/smtp.ts`. Cân nhắc gộp coverage test tích hợp nếu thêm < 1 phút.

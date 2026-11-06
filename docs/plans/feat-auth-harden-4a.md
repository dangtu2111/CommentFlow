# Kế hoạch `feat-auth-harden-4a` — Siết bảo mật đăng nhập (đợt 4a)

## Việc

Mã gap matrix: `AUTH-HARDEN-4a` (mục 2, 4, 6 của AUTH-HARDEN-4) · Spec: `docs/decisions/004-bao-ve-tai-khoan.md`, `docs/13`.

**Tóm tắt:** Ba việc nhỏ làm chắc phần đăng nhập: (1) app không khởi động nếu `REDIS_KEY_PREFIX` rỗng ở dev/test/ci/staging (tránh khóa giới hạn tốc độ của các môi trường đè lên nhau); (2) Server Action trang bảo mật kiểm đầu vào bằng Zod (thư viện kiểm dữ liệu) thay vì kiểm tay; (3) công cụ kiểm RLS (`check-rls`) so khớp chính xác điều kiện policy chặn tạo Admin thay vì chỉ tìm tên cột. Rủi ro thấp; không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `loadServerEnv` ném lỗi nhắc `REDIS_KEY_PREFIX` khi APP_ENV là dev/test/ci/staging mà biến thiếu/rỗng/toàn khoảng trắng; production được để trống — kiểm bằng `env.test.ts`.
2. Server Action trang bảo mật đọc `password`/`code`/`sessionId` qua `parseSecurityInput` (Zod); giá trị sai → trạng thái lỗi, không gọi saas-core — kiểm bằng `security-form.test.ts`.
3. `checkAdminInsertGuard` chỉ chấp nhận biểu thức `NOT is_admin AND admin_role IS NULL` (bỏ ngoặc/khoảng trắng/hoa thường); biểu thức có OR/IS NOT NULL → đỏ — kiểm bằng `check-rls.test.ts`.

## File sẽ đọc

`apps/web/src/server/env.ts`, `apps/web/src/app/app/security/actions.ts`, `apps/web/src/lib/security-form.ts`, `packages/db/src/check-rls.ts` (+ test tương ứng), `.github/workflows/ci.yml` (xác nhận CI đã đặt prefix).

## File sẽ sửa / tạo

Các file trên; `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/handoff/feat-auth-harden-4a.md`.

## Migration

Không có.

## Test viết trước

Ba nhóm test ở Tiêu chí nghiệm thu.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/server/env.test.ts src/lib/security-form.test.ts`; `pnpm --filter @flow/db exec vitest run src/check-rls.test.ts`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` (auth, đầu vào Server Action, kiểm RLS).

## Rủi ro / câu hỏi cho chủ dự án

Máy dev có `.env` thiếu `REDIS_KEY_PREFIX` sẽ báo lỗi khi khởi động (mẫu `env.example` đã có `dev:`); E2E/CI/staging đã đặt sẵn.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong gap matrix/ADR 004). Không có bảng mới.

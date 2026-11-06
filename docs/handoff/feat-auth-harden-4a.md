# Bàn giao `feat-auth-harden-4a` (claude, làn a)

## Đã làm

- `env.ts`: `REDIS_KEY_PREFIX` (trim) bắt buộc khác rỗng khi `APP_ENV` ≠ production (superRefine) + test.
- `security-form.ts`: `parseSecurityInput` (Zod: password ≤128, code ≤64, sessionId uuid); `actions.ts` dùng nó, bỏ hàm `text`. Sai → trạng thái lỗi, không gọi saas-core.
- `check-rls.ts`: `checkAdminInsertGuard` so khớp chính xác `NOT is_admin AND admin_role IS NULL` (bỏ ngoặc/khoảng trắng/hoa thường) + test biểu thức có OR/IS NOT NULL → đỏ.
- Không migration; không đụng `packages/saas-core`.

## Đã đọc và rút ra

- CI (`ci.yml`), compose staging, `e2e-env.mjs` đã đặt `REDIS_KEY_PREFIX`; `env.example` có `dev:`.
- `packages/db` không có script `test:coverage`.

## Kiểm chứng

- verifier-security: không có mục chặn merge. Đã sửa gợi ý "nên sửa": chuẩn hóa chỉ bỏ khoảng trắng, GIỮ ngoặc (tránh `NOT (is_admin AND …)` lọt) + test.
- Gợi ý tùy chọn chưa làm: bắt tiền tố `REDIS_KEY_PREFIX` bắt đầu bằng `${APP_ENV}:`.

## Chưa chạy

- `pnpm test:db` (không thuộc làn a, không đổi migration).

## Còn lại

- AUTH-HARDEN-4b (làn b: `UNIQUE(user_id)` two_factors, test tự seed, `docs/10` §3.1) và mục (5)/(7).

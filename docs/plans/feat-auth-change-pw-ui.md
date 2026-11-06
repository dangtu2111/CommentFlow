# Kế hoạch `feat-auth-change-pw-ui` — Đổi mật khẩu trong Cài đặt

## Việc

Mã gap matrix: `AUTH-CHANGE-PW-UI` · Spec: FR-001, `docs/13` §2 (đổi mật khẩu → xóa mọi phiên; kiểm mật khẩu lộ).

**Tóm tắt:** Thêm form "Đổi mật khẩu" vào trang bảo mật hiện có (`/app/security`, chỗ tạm của Cài đặt cho tới `SETTINGS-PAGE`). Server Action gọi luồng mới `createChangePasswordFlow` (saas-core) — kiểm độ dài, mật khẩu phổ biến/đã lộ (`AUTH-PWNED`), giới hạn số lần thử, rồi `changePasswordAndRevokeAll` (đổi mật khẩu + đăng xuất mọi thiết bị). Xong thì chuyển về `/login`. Rủi ro: chạm mật khẩu/phiên nên cần kiểm chứng bảo mật.

## Điểm chưa rõ

Không có. (Vị trí form: Q QPW1 — dùng trang bảo mật hiện có.)

## Tiêu chí nghiệm thu

1. Mật khẩu hiện tại sai → trạng thái lỗi `wrongPassword`, mật khẩu không đổi, phiên còn — test đơn vị flow + test form.
2. Mật khẩu mới ngắn (<10)/dài (>128)/phổ biến/đã lộ (HIBP) → lỗi đúng khóa, KHÔNG gọi đổi mật khẩu — test đơn vị flow.
3. Mật khẩu mới trùng mật khẩu hiện tại → lỗi `passwordSame` — test đơn vị.
4. Quá 5 lần thử/15 phút (bộ đếm `reauth` theo userId) → `rateLimited`; thành công xóa bộ đếm — test đơn vị.
5. Thành công → gọi `changePasswordAndRevokeAll` đúng một lần với headers của phiên; Action chuyển về `/login` — test đơn vị + test quét `requireAppUser`.
6. Server Action gọi `requireAppUser` trước mọi việc, không nhận userId từ form; xác nhận mật khẩu mới khớp ô nhập lại (Zod) — test `change-password-form.test.ts` + scan.
7. Chuỗi vi/en đủ khóa, không viết cứng — `pnpm lint:i18n` + test khớp khóa.
8. `pnpm lint typecheck depcruise check:plans test:trace`, coverage `@flow/saas-core` đạt ngưỡng.

## File sẽ đọc / sửa

Đã đọc: `saas-core/src/auth/{revoke,password-policy,two-factor(reauth),flows(checkPassword)}.ts`, `ratelimit/limiter.ts`, `web/src/app/app/security/{actions,page}`, `lib/{security-form,auth-form}.ts`, `components/security/two-factor-card.tsx`, `server/auth.ts`.

Sửa/tạo:
- `packages/saas-core/src/auth/change-password.ts` (+ `.test.ts`) — luồng mới (mới)
- `packages/saas-core/src/auth/index.ts` — export
- `apps/web/src/server/auth.ts` — lắp `changePassword` vào runtime
- `apps/web/src/lib/change-password-form.ts` (+ test) — Zod + ánh xạ kết quả → trạng thái (mới)
- `apps/web/src/app/app/security/actions.ts` — `changePasswordAction`
- `apps/web/src/components/security/change-password-card.tsx` — form (mới)
- `apps/web/src/app/app/security/page.tsx` — gắn thẻ
- `packages/shared/src/i18n/messages/{vi,en}.json` — chuỗi
- docs: gap-matrix, MASTER, codemap, QUYET_DINH_CHO_DUYET, KIEM_TRA_TAY, handoff

## Migration

Không có.

## Test viết trước

`change-password.test.ts` (flow, với auth/limiter/policy giả) và `change-password-form.test.ts` — viết, thấy đỏ, rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/auth/change-password.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/change-password-form.test.ts`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` (mật khẩu, phiên, rate limit), một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

HIBP lỗi → cho qua (đúng ADR 004). Không có câu hỏi.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (module mới nhỏ trong saas-core, không thư viện mới).

## Checklist plan

- [x] Không còn thẻ chưa rõ
- [x] Tiêu chí nghiệm thu kiểm được
- [x] Danh sách file đọc/sửa
- [x] Xác định cần verifier

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/ADR 004; vị trí form theo QPW1)

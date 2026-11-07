# Kế hoạch `feat-wire-settings-profile` — Cài đặt › Tài khoản & Bảo mật, lát 1b: hồ sơ, SĐT + OTP, chế độ tối, mã dự phòng, IP phiên (làn a)

Mã gap matrix: `SETTINGS-PROFILE-WIRE` · Spec: `docs/13_Security_Design.md` §2, `docs/08_UI_UX_Specification.md` §2/§7, `design/stitch/cai-dat-chinh-sua-thong-tin-ca-nhan-edit-profile-modal.html`, `cai-dat-xac-minh-so-dien-thoai-phone-verification-modal-flow.html`, `cai-dat-tai-khoan-bao-mat-che-do-toi-dark-mode.html`.

**Tóm tắt:** Trang Cài đặt › Tài khoản & Bảo mật còn các mục "Sắp có": chỉnh sửa thông tin, số điện thoại, chế độ Tối, số mã dự phòng còn lại, IP của phiên. Nhánh này nối thật cả năm mục. SĐT dùng OTP (mã dùng một lần gửi qua SMS) nhưng chỉ có bản MOCK, không gửi SMS thật, cờ mặc định TẮT. Rủi ro: chạm xác thực/phiên/PII và có migration nhỏ → cần verifier-security + verifier-db một lần.

## Điểm chưa rõ

Không có. Các điểm tự chọn phương án an toàn ghi ở `docs/plans/quyet-dinh/qwprof1.md` (tổng số mã dự phòng thật là 10 chứ không phải 8; phạm vi chế độ tối; cách lưu IP che).

## Tiêu chí nghiệm thu

1. Hộp thoại "Chỉnh sửa thông tin": đổi họ tên + múi giờ lưu vào `users` (Zod; email chỉ đọc); người khác không sửa được hồ sơ của mình — kiểm bằng: `profile.test.ts`, `packages/db/tests/user-profile.int.test.ts` (RLS), E2E vi+en.
2. Ghi nhật ký `security.profile_updated` (chỉ tên trường đổi, không giá trị/PII) — kiểm bằng: `security-audit.test.ts`.
3. Ảnh đại diện: chỉ JPG/PNG ≤ 2MB (kiểm cả chữ ký byte), lưu qua interface `AvatarStore` bản MOCK; cờ `NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED` TẮT → nút vô hiệu, action từ chối — kiểm bằng: `avatar.test.ts`.
4. SĐT chuẩn hóa E.164, hiển thị che giữa; OTP băm HMAC, hết hạn 5 phút, tối đa 5 lần sai rồi mã chết, giới hạn tốc độ theo (user, SĐT), phản hồi đồng nhất (chống liệt kê), SMS chỉ qua `SmsProvider` MOCK (không gửi thật), cờ `PHONE_VERIFY_ENABLED` TẮT → từ chối — kiểm bằng: `phone-verify.test.ts` (viết trước), `phone-otp.int.test.ts` (RLS: `cf_app` không đọc được bảng/cột SĐT), E2E.
5. Hộp thoại xác minh SĐT 3 bước (nhập → OTP 6 ô + đếm ngược + gửi lại → thành công) khớp Stitch — kiểm bằng: E2E + ảnh chụp.
6. Chế độ Sáng/Tối/Theo hệ thống lưu `users.theme` + cookie, áp bằng thuộc tính `data-theme` trên `<html>`, không nháy sáng khi tải; token tối chép từ HTML Stitch — kiểm bằng: `theme.test.ts`, E2E (khung Cài đặt ở chế độ tối), ảnh chụp.
7. Số mã dự phòng còn lại `n/10` thật (đếm, không lộ mã) — kiểm bằng: `backup-codes.test.ts` + test tích hợp `two-factor.int.test.ts` mở rộng.
8. Phiên hiển thị IP đã che (`113.161.x.x`) + trình duyệt/HĐH; IP thô không đến client và phiên mới lưu IP che — kiểm bằng: `ip-mask.test.ts`, E2E.
9. Không dựng "Tiêu chuẩn: ISO 27001" hay chứng nhận nào — kiểm bằng: `grep -ri "ISO 27001" apps/web/src` rỗng.
10. Kiểm tay `docs/testing/kiem-tra-tay.d/kt-wprof.md` ≤ 10 bước; `pnpm precheck` xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

- `packages/saas-core/src/auth/two-factor.ts` (đã đọc) — `overview`, nơi thêm số mã dự phòng + IP che.
- `packages/saas-core/src/auth/auth.ts` (đã đọc) — hook tạo phiên để lưu IP che.
- `packages/db/migrations/0010…`, `0012…` (đã đọc) — mẫu GRANT cột/RLS `users`.
- `apps/web/src/components/settings/{account-card,language-card}.tsx`, `security/sessions-card.tsx`, `settings/tw/{ui,dialog}.tsx` — nơi dựng.
- 3 HTML Stitch mới — class Tailwind + token tối.
- `apps/web/src/lib/security-audit.ts` — thêm sự kiện.

## File sẽ sửa / tạo

Xem commit; nhóm chính: `packages/db/migrations/0062_user_profile.sql` + schema; `packages/saas-core/src/auth/{phone,phone-verify,sms-provider,ip-mask,backup-codes}.ts`; `ratelimit/limiter.ts`; `apps/web/src/{lib,server}/profile*.ts`, `app/app/(guarded)/settings/{actions.ts,profile-actions.ts}`; `components/settings/{account-card,language-card,profile-dialog,phone-dialog}.tsx`; `components/security/sessions-card.tsx`; `app/layout.tsx` + `styles/theme-dark.css`; `e2e/tests/settings-profile.spec.ts`; docs (`can-ban-cung-cap.d`, `kiem-tra-tay.d`, `codemap.d`, `quyet-dinh`, `handoff`).

## Migration

`0062_user_profile.sql` (không có nhánh nào khác đang giữ migration — PR mở: #225, #226 đều không có): thêm cột `users.timezone` (mặc định `Asia/Ho_Chi_Minh`), `phone` (E.164, CHECK), `phone_verified_at`, `theme` (`light|dark|system`); bảng `core.phone_verifications` (một thử thách/người dùng; chỉ `cf_auth`, RLS đòi `in_auth_context`). `cf_app`: UPDATE thêm `timezone`, `theme` (policy `users_app_update` sẵn có = chỉ dòng của mình), SELECT thêm `timezone`, `theme`; **không** đọc/ghi `phone*`. `cf_auth`: UPDATE `phone`, `phone_verified_at`, `timezone`, `theme`. Đường lùi: DROP TABLE + DROP COLUMN + trả GRANT cũ. Cập nhật `check-rls` (danh sách cột đọc được) + docs/10.

## Test viết trước

OTP/SĐT/IP/theme/avatar là logic quy tắc → test đỏ trước: `phone-verify.test.ts` (hạn, số lần, băm, giới hạn, đồng nhất phản hồi, chuẩn hóa E.164), `ip-mask.test.ts`, `backup-codes.test.ts`, `avatar.test.ts`, `theme.test.ts`, `profile.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/auth/phone-verify.test.ts` (tương tự các file trên) · `pnpm --filter @flow/web exec vitest run src/lib/profile.test.ts` · `pnpm test:db` (phạm vi file `user-profile.int.test.ts`, `phone-otp.int.test.ts`) · E2E `settings-profile.spec.ts`.

## Cần kiểm chứng độc lập không?

**Có.** `verifier-security` một lần (OTP, phiên, IP, che PII) và `verifier-db` một lần (migration 0062 + RLS), ở cuối nhánh sau khi công cụ xanh.

## Rủi ro / câu hỏi cho chủ dự án

- SMS thật cần nhà cung cấp (SMS brandname/Zalo ZNS): ghi ở `docs/can-ban-cung-cap.d/`. Nhánh này chỉ có MOCK.
- Chế độ tối có thể chỉ áp cho khung Cài đặt (xem quyết định); ghi rõ ở PR.

## Đề xuất thay đổi

`docs/10` mục `users` và danh sách cột `cf_app` đọc được (từ 7 lên 9 cột) — sửa cùng nhánh theo quyết định đã ghi.

## Complexity tracking

Không có (không thêm thư viện: băm bằng `node:crypto`, giải mã mã dự phòng bằng `better-auth/crypto` sẵn có). Interface `SmsProvider`/`AvatarStore` có ≥ 2 bản cài (MOCK + "chưa cấu hình/thật") nên đúng ngoại lệ connector.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": `phone_verifications` không có workspace_id (dữ liệu của người dùng); chỉ `cf_auth` đọc/ghi, `cf_app` không có quyền nào.

## Trạng thái duyệt

**Đã duyệt** (giao việc trực tiếp bởi chủ dự án, 07/11/2026: phạm vi và các ràng buộc đã nêu trong yêu cầu).

# Handoff `feat-wire-settings-profile` (claude, làn a)

## Đã làm
- **Migration 0062** (`users.timezone/phone/phone_verified_at/theme` + bảng `core.phone_verifications` chỉ `cf_auth`); `cf_app` chỉ GHI `timezone/theme` (policy sẵn có = dòng của mình), không đọc, không chạm SĐT. `check-rls` thêm các quyền bị cấm; test `user-profile.int.test.ts`.
- **saas-core**: `phone.ts` (E.164 + che giữa), `phone-verify.ts` (OTP băm HMAC, 5 phút, 5 lần, gửi lại 60s, giới hạn `phoneOtpSend`/`phoneOtpVerify` theo user+SĐT, phản hồi đồng nhất), `sms-mock.ts` (chỉ dev/test/ci), `profile-store.ts` (cf_auth), `ip-mask.ts` (+ hook lưu IP che khi tạo phiên), `backup-codes.ts` (đếm bằng giải mã trong bộ nhớ), `tenancy.setUserProfile/setUserImage`.
- **web**: `profile-actions.ts`, hộp thoại `ProfileDialog` + `PhoneDialog` (3 bước), `LanguageCard` Sáng/Tối/Theo hệ thống, `theme-dark.css` (màu Stitch) + `layout.tsx` (`data-theme`, script chống nháy), thẻ 2FA hiện `n/10`, thẻ phiên hiện IP che.
- Test: đơn vị (phone, ip-mask, phone-verify, backup-codes, sms-mock, tenancy-profile, avatar, theme, profile-form, security-audit, profile-config), tích hợp DB (`user-profile`, `phone-otp`, mở rộng `two-factor`), E2E `settings-profile.spec.ts`.

## Đã đọc và rút ra
- Token app là hex cố định trong `tailwind.config.ts` (không biến CSS theo chủ đề) → chế độ Tối chỉ áp cho `.app-page-settings` bằng ghi đè (đúng cách HTML Stitch làm).
- Thiết kế Stitch có nhiều nội dung không thật (ISO 27001, "Enterprise", "SaaS Security v2.4", "mã hóa End-to-End SHA-256", "Miễn phí SMS", Zalo OTP, "Đã bảo vệ 100%", "Lỗi OTP-401", "Hỗ trợ 24/7") — KHÔNG dựng.
- `/app/security` và `/app/settings` đều dùng `TwoFactorCard`/`SessionsCard`; plugin 2FA: gọi bật khi đã bật trả `already_enabled` (nên "Đổi thiết bị xác thực" cần luồng mới).
- CSP `img-src 'self' data:` — ảnh đại diện thật ở miền khác sẽ bị chặn tới khi thêm miền vào CSP (đã ghi ở `can-ban-cung-cap.d/profile-sms-avatar.md`).

## Còn lại
- **"Đổi thiết bị xác thực"** (nút còn "Sắp có" ở thẻ 2FA): cần luồng đổi secret TOTP (mật khẩu → secret mới → xác nhận mã → thay) — đề xuất lát riêng `2FA-SWITCH-DEVICE`, kèm verifier-security. "Xem lại mã"/"Tải .txt" cho mã đã tạo: đã BỎ (mã chỉ hiện một lần theo docs/13; tải .txt vẫn có lúc tạo).
- Chế độ Tối toàn app: đổi token Tailwind sang biến CSS (đề xuất riêng).
- Khi có nhà cung cấp SMS/lưu ảnh: viết `SmsProvider`/`AvatarStore` thật (xem `docs/can-ban-cung-cap.d/profile-sms-avatar.md`).
- `users.theme` chưa dùng để khôi phục cookie trên thiết bị mới (cookie là nguồn lần tải đầu).
- Chờ chủ dự án chạy KT-WPROF.

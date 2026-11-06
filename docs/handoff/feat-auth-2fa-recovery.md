# Handoff `feat-auth-2fa-recovery` (claude, làn d)

## Đã làm
Logic khôi phục 2FA ở `packages/saas-core/src/auth/recovery/` (phase thuần + service + kho bộ nhớ) + 2 hành động rate limit; test đơn vị + fast-check. Quyết định QRCV1.

## Đã đọc và rút ra
- `two-factor.ts`: mã dự phòng đã dùng được ở `verifyLogin(kind='backup')`; plugin Better Auth giữ bảng `two_factors` (một dòng/người, UNIQUE).
- `limiter.ts`: thêm hành động = thêm vào `RateAction` + `RATE_POLICIES`.
- `revoke.ts`: `revokeAllSessionsOfUser` dùng cho `effects.revokeAllSessions`.

## Verifier-security (một lần): không có mục chặn merge
Đã sửa: người lạ không hủy được yêu cầu đang chờ; admin nền tảng bắt buộc admin khác duyệt (không tự hết hạn chờ); xóa phiên trước, tắt 2FA sau + audit `complete_failed`; `cancelOpenForUser`.
Để lại khi nối web: (a) quyết định ai được duyệt (khuyến nghị Super Admin) + `reason` + ghi docs/13 §3.2; (b) cấp token hoàn tất riêng sau `confirmEmail` và link xác minh dùng POST; (c) gửi thư ở nền để cân thời gian phản hồi; (d) Zod + giới hạn độ dài ở ranh giới; (e) ghi ngưỡng `recovery`/`recoveryComplete` vào ADR 004 §1, cân nhắc trần tổng số lần sai; (f) gọi `cancelOpenForUser` khi đăng nhập 2FA thành công/cài lại 2FA; (g) bảng DB: chỉ `cf_auth`, `verifier-db` kiểm.

## Còn lại
Migration bảng yêu cầu (làn b) + `PgRecoveryStore` (dùng `UPDATE … WHERE status = $from` cho `transition`); mailer SMTP; giao diện; `effects.disableTwoFactor` thật (xóa hàng `two_factors` + `totp_enabled=false` qua `cf_auth`).

# Handoff fix/2fa-backup-codes (claude)

Nguyên nhân: sau `confirmTwoFactorAction` (đặt cookie phiên mới do plugin xoay phiên), Next dựng lại trang /app/security trong cùng request nhưng `headers()` vẫn mang cookie CŨ (phiên đã bị xóa) → trang `redirect('/login')` → /login chuyển người đã có phiên mới sang /app. Màn mã dự phòng không bao giờ hiện (bằng chứng: trace CI run 41995533612, phản hồi action chứa `NEXT_REDIRECT;replace;/login`).
Sửa: `requestContext()` dựng header Cookie từ `cookies()` (`lib/cookie-header.ts`); trang security dùng `requestContext()` thay `headers()` thô.
Kiểm: unit `cookie-header.test.ts`; E2E gate0 (bật 2FA → thấy mã dự phòng → "đã lưu") là test thường trực. Chưa chạy E2E cục bộ (không Docker) — cần CI xác nhận.
Còn lại: verifier-security (auth/phiên); sau merge, #37 cập nhật từ main.

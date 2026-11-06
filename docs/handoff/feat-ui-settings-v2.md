# Bàn giao `feat-ui-settings-v2` (claude, làn a)

**Đã làm:** khung `SettingsFrame` (cột trái + đường dẫn) cho settings/channels/members; bỏ tab Cài đặt (`TAB_SECTIONS`); `revokeOtherSessions` (saas-core + Server Action); banner vừa bật 2FA, khối mã dự phòng (Tạo lại, Tải .txt); thẻ Ngôn ngữ + Sáng/Tối; i18n vi/en; ảnh trước/sau ở `docs/plans/ui-fidelity/settings-v2/`.

**Đã đọc + rút ra:** `two-factor.ts` `overview` chỉ trả trạng thái + phiên (không IP, không đếm mã); `core.two_factors` chỉ `cf_auth` đọc → không có số mã còn lại/ngày bật (gap `SETTINGS-SECURITY-DATA`). Dev server cổng 3101 của worktree này chạy sẵn từ trước (PID 7144) — dùng lại để chụp.

**Còn lại:** `SETTINGS-SECURITY-DATA`; trang Gói & Thanh toán (chờ PLANS-SCHEMA); chưa chụp trang thật (cần DB + phiên); chưa chụp các hộp thoại modal riêng ở bản mới (không đổi so với `ui-settings/`).

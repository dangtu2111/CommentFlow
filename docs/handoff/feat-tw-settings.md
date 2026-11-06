# Handoff `feat-tw-settings` (làn a, claude)

**Đã làm:** khung Cài đặt + Bảo mật (thẻ 2FA, tài khoản, đổi mật khẩu, phiên, ngôn ngữ, bốn hộp thoại), Thành viên, Gói & Thanh toán dựng bằng Tailwind; thành phần riêng ở `components/settings/tw/`. Plan `docs/plans/feat-tw-settings.md`, quyết định `q-tws1`.

**File đã đọc + điều rút ra:**
- Luật `lint:i18n` chỉ miễn hàm tên `t(...)`; `ts('soon')`, `labelledBy="x"`, prop như `iconTone="text-primary"` bị chặn → dùng `t`, hằng số, hoặc ReactNode.
- `.app-page-settings` (globals.css) đã cho lề 16px → khung không tự đệm; trang giữ `app-page app-page-settings`.
- Chuỗi vi/en ở `packages/shared/src/i18n/messages/`; khóa thêm vào giữa các khối `settings`, `members`, `auth.security.twoFactor`.

**Chưa làm / còn lại:**
1. Đo `pnpm ui:fidelity` (1440 + 1920) và ảnh trước/sau: máy xem trước :3101 và cổng thử không phản hồi khi làm → chưa có số đo.
2. Thông báo, Quyền riêng tư, Kênh, `usage-meter-card`, `reply-language-card`, `payment-qr-card` còn CSS cũ bên trong khung mới.
3. Màn `settings-password-changed` chưa dựng (hành động đổi mật khẩu chuyển về `/login`).
4. `split-layout.css`, `settings-pages.css`, `section-head`, `dialog` cũ: gỡ bằng PR `[CHUNG]` khi hết người dùng.
5. Khối Stitch bịa (Meta Tech Partner, ISO 27001, SOC2…) đã bỏ — xem Q-TWS1.

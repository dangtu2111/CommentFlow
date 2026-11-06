# Handoff `feat-ui-html-auth` (claude)

**Đã làm:** tách CSS xác thực khỏi `globals.css` → `components/auth/{auth-shell,auth-status,auth-demo-card,auth-social}.css` (số đo theo `auth-login-register.html`); thêm `AuthStatus` (+ test) dùng ở check-email, verify-email, reset-password (lỗi), invite; công cụ đo `e2e/tools/ui-compare-auth.mjs`; kết quả `docs/plans/ui-fidelity/ui-html-auth/so-sanh.md`; Q-UIAUTH1.

**Đã đọc, rút ra:** Stitch dùng Tailwind CDN (cần mạng khi mở file://); `accept-invite.html` hiển thị email/tên người gửi/token — KHÔNG làm (spec 13). Form đăng ký Stitch có tên shop + ngành hàng: backend chưa có nên không thêm.

**Còn lại:** 3 thư email + `staff-welcome` (mẫu thư ở saas-core/notify, ngoài làn web); thẻ đăng nhập còn thấp hơn Stitch 92px do bỏ phần không có thật.

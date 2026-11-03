-- HARDEN-3 (c): thu hẹp cột users mà cf_app đọc được. Trước đây cf_app có SELECT cả bảng nên trong
-- withWorkspace(W) đọc được is_admin, admin_role, email_verified, totp_enabled của mọi thành viên (và withUser
-- đọc của chính mình). Giờ cf_app chỉ đọc các cột cần cho danh sách thành viên và hồ sơ cơ bản; trạng thái
-- email_verified / totp_enabled / is_admin của người đang đăng nhập chỉ lấy từ phiên phía server (Better Auth,
-- role cf_auth), không đọc bằng cf_app và không nhận từ client.
-- Policy giữ nguyên (chỉ lọc dòng); cf_auth không đổi.
-- Đường lùi: GRANT SELECT ON core.users TO cf_app.
REVOKE SELECT ON core.users FROM cf_app;
--> statement-breakpoint
GRANT SELECT (id, email, name, image, locale, created_at, updated_at) ON core.users TO cf_app;

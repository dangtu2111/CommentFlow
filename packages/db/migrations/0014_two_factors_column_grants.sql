-- Siết quyền cf_auth trên core.two_factors theo mẫu core.sessions: chỉ được SỬA các cột plugin 2FA thật sự cập nhật,
-- KHÔNG sửa được user_id/id (đổi user_id sẽ chuyển secret TOTP sang người khác).
-- Đường lùi: REVOKE UPDATE (...) rồi GRANT UPDATE ON core.two_factors TO cf_auth (bản 0013).
-- Lưu ý khi lùi 0013 (DROP TABLE core.two_factors): phải kèm UPDATE core.users SET totp_enabled = false.
REVOKE UPDATE ON core.two_factors FROM cf_auth;
--> statement-breakpoint
GRANT UPDATE (secret, backup_codes, verified, failed_verification_count, locked_until) ON core.two_factors TO cf_auth;

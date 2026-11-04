-- ===================================================================================================
-- fix/token-key-missing: cf.channel_key_versions() — các key_version đang dùng trong channels (xuyên workspace).
-- cf_app không có quyền cột key_version (0019) nên kiểm tra lúc khởi động (web/worker: mọi phiên bản đang dùng phải có khóa
-- trong TOKEN_ENC_KEYS) đi qua hàm DEFINER này. Chỉ trả số nguyên (không workspace, không kênh, không ciphertext).
-- Hàm KHÔNG đòi ngữ cảnh: lúc khởi động chưa có workspace/người dùng.
-- Đường lùi: DROP FUNCTION cf.channel_key_versions().
-- ===================================================================================================

CREATE FUNCTION cf.channel_key_versions() RETURNS SETOF integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, cf, pg_temp
AS $$
  SELECT DISTINCT c.key_version FROM cf.channels c WHERE c.access_token_enc IS NOT NULL ORDER BY 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.channel_key_versions() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.channel_key_versions() TO cf_app;

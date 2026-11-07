-- SHOPIFY-CONNECT-STORE (đổi thiết kế, 07/11/2026): ứng dụng Shopify tạo ở Dev Dashboard kết nối bằng CLIENT ID + CLIENT SECRET
-- (luồng client credentials: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant).
-- Token Admin API chỉ sống 24 giờ và không có refresh token, nên KHÔNG lưu token: lưu Client ID (không bí mật) + Client secret
-- (mã hóa AES-256-GCM ở tầng ứng dụng); worker đổi lấy token mới ở mỗi lần đồng bộ.
-- Thay đổi so với 0064 (chưa dùng ở môi trường nào ngoài dev):
--   * cột `access_token_enc` đổi tên `client_secret_enc` (ciphertext của Client secret); thêm `client_id`.
--   * save_shopify_store(domain, client_id, ciphertext, key_version); read_shopify_store_token() → read_shopify_store_credentials()
--     trả thêm client_id; disconnect/request_sync đọc cột mới. Quyền giữ nguyên: ghi = Owner/hệ thống, đọc ciphertext = CHỈ hệ thống.
-- Đường lùi: chạy lại 0064 sau khi DROP các hàm bên dưới và DROP COLUMN client_id, RENAME COLUMN client_secret_enc TO access_token_enc.
ALTER TABLE "cf"."shopify_stores" RENAME COLUMN "access_token_enc" TO "client_secret_enc";
--> statement-breakpoint
ALTER TABLE "cf"."shopify_stores" ADD COLUMN "client_id" text;
--> statement-breakpoint
ALTER TABLE "cf"."shopify_stores" ADD CONSTRAINT "shopify_stores_client_id_check" CHECK ("cf"."shopify_stores"."client_id" IS NULL OR "cf"."shopify_stores"."client_id" ~ '^[A-Za-z0-9._-]{8,100}$');
--> statement-breakpoint
DROP FUNCTION cf.save_shopify_store(text, bytea, integer);
--> statement-breakpoint
DROP FUNCTION cf.read_shopify_store_token();
--> statement-breakpoint

CREATE FUNCTION cf.save_shopify_store(p_domain text, p_client_id text, p_ciphertext bytea, p_key_version integer) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_system boolean := core.is_system_context();
  v_inserted boolean;
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR v_system) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_domain IS NULL OR p_domain !~ '^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$' THEN
    RAISE EXCEPTION 'invalid shop domain' USING ERRCODE = '22023';
  END IF;
  IF p_client_id IS NULL OR p_client_id !~ '^[A-Za-z0-9._-]{8,100}$' THEN
    RAISE EXCEPTION 'invalid client id' USING ERRCODE = '22023';
  END IF;
  -- AES-GCM: nonce 12 + tag 16 byte tối thiểu; key_version dương.
  IF p_ciphertext IS NULL OR octet_length(p_ciphertext) < 28 OR p_key_version IS NULL OR p_key_version < 1 THEN
    RAISE EXCEPTION 'invalid secret payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO cf.shopify_stores AS s (workspace_id, shop_domain, client_id, client_secret_enc, key_version, status)
  VALUES (v_ws, p_domain, p_client_id, p_ciphertext, p_key_version, 'connected')
  ON CONFLICT (workspace_id) DO UPDATE
    SET shop_domain = EXCLUDED.shop_domain,
        client_id = EXCLUDED.client_id,
        client_secret_enc = EXCLUDED.client_secret_enc,
        key_version = EXCLUDED.key_version,
        status = 'connected',
        last_sync_requested_at = NULL,
        last_sync_result = NULL,
        updated_at = now()
  RETURNING (xmax = 0) INTO v_inserted;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (
    v_ws,
    CASE WHEN v_system THEN 'system' ELSE 'user' END,
    CASE WHEN v_system THEN NULL ELSE core.current_user_id() END,
    CASE WHEN v_inserted THEN 'shopify.connected' ELSE 'shopify.reconnected' END,
    'shopify_store', v_ws::text,
    jsonb_build_object('shop_domain', p_domain, 'key_version', p_key_version)
  );
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.disconnect_shopify_store() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_system boolean := core.is_system_context();
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR v_system) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE cf.shopify_stores
     SET client_secret_enc = NULL, client_id = NULL, status = 'disconnected', last_sync_requested_at = NULL,
         updated_at = now()
   WHERE workspace_id = v_ws;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shopify store not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
  VALUES (
    v_ws,
    CASE WHEN v_system THEN 'system' ELSE 'user' END,
    CASE WHEN v_system THEN NULL ELSE core.current_user_id() END,
    'shopify.disconnected', 'shopify_store', v_ws::text
  );
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.request_shopify_sync() RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR core.is_system_context()) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE cf.shopify_stores
     SET last_sync_requested_at = now(), updated_at = now()
   WHERE workspace_id = v_ws AND status = 'connected' AND client_secret_enc IS NOT NULL
     AND (last_sync_requested_at IS NULL OR last_sync_requested_at < now() - interval '60 seconds');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END
$$;
--> statement-breakpoint

-- Đọc thông tin xác thực: CHỈ đường hệ thống. Trả 0 hoặc 1 dòng (chưa kết nối/đã ngắt/token hỏng → 0 dòng).
CREATE FUNCTION cf.read_shopify_store_credentials()
RETURNS TABLE (shop_domain text, client_id text, ciphertext bytea, key_version integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.shop_domain, s.client_id, s.client_secret_enc, s.key_version
      FROM cf.shopify_stores s
     WHERE s.workspace_id = core.current_workspace_id()
       AND s.status = 'connected' AND s.client_secret_enc IS NOT NULL AND s.client_id IS NOT NULL;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.save_shopify_store(text, text, bytea, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.read_shopify_store_credentials() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.save_shopify_store(text, text, bytea, integer) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.read_shopify_store_credentials() TO cf_app;

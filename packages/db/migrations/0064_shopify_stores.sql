-- SHOPIFY-CONNECT-STORE (Cơ sở kiến thức › Nguồn dữ liệu › Kết nối Shopify): MỘT cửa hàng Shopify mỗi workspace.
-- Thiết kế quyền (mẫu token kênh, migration 0020):
--   * cf.shopify_stores: cf_app chỉ ĐỌC cột không bí mật (không `access_token_enc`, không `key_version`) và chỉ Owner của
--     workspace (hoặc ngữ cảnh hệ thống) thấy dòng; KHÔNG có INSERT/UPDATE/DELETE trực tiếp.
--   * Ghi qua hàm SECURITY DEFINER (search_path cố định, REVOKE PUBLIC, GRANT cf_app):
--       save_shopify_store / disconnect_shopify_store / request_shopify_sync  = Owner đang hoạt động (withActor) hoặc hệ thống;
--       read_shopify_store_token / record_shopify_sync                         = CHỈ hệ thống (withJob, worker).
--     Web không bao giờ đọc ciphertext; token Admin API được mã hóa ở tầng ứng dụng (AES-256-GCM, TOKEN_ENC_KEYS).
--   * request_shopify_sync giữ thời gian chờ NGUYÊN TỬ (60 giây) để hai lần bấm không đẩy hai job.
--   * last_sync_result ∈ ok | token_invalid (token hết hiệu lực → status = 'invalid') | error (lỗi tạm) | unavailable
--     (đồng bộ Shopify đang tắt ở worker, không gọi Shopify).
-- Đường lùi: DROP FUNCTION cf.save_shopify_store, cf.disconnect_shopify_store, cf.request_shopify_sync,
--   cf.read_shopify_store_token, cf.record_shopify_sync; DROP TABLE cf.shopify_stores (MẤT kết nối + token; sản phẩm đã nạp giữ nguyên).
CREATE TABLE "cf"."shopify_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"shop_domain" text NOT NULL,
	"access_token_enc" bytea,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_requested_at" timestamp with time zone,
	"last_sync_result" text,
	"last_sync_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_stores_workspace_unique" UNIQUE("workspace_id"),
	CONSTRAINT "shopify_stores_domain_check" CHECK ("cf"."shopify_stores"."shop_domain" ~ '^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$'),
	CONSTRAINT "shopify_stores_status_check" CHECK ("cf"."shopify_stores"."status" IN ('connected', 'invalid', 'disconnected')),
	CONSTRAINT "shopify_stores_result_check" CHECK ("cf"."shopify_stores"."last_sync_result" IS NULL OR "cf"."shopify_stores"."last_sync_result" IN ('ok', 'token_invalid', 'error', 'unavailable'))
);
--> statement-breakpoint
ALTER TABLE "cf"."shopify_stores" ADD CONSTRAINT "shopify_stores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE cf.shopify_stores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT (id, workspace_id, shop_domain, status, last_synced_at, last_sync_requested_at, last_sync_result,
  last_sync_summary, created_at, updated_at) ON cf.shopify_stores TO cf_app;
--> statement-breakpoint
CREATE POLICY shopify_stores_select ON cf.shopify_stores FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint

CREATE FUNCTION cf.save_shopify_store(p_domain text, p_ciphertext bytea, p_key_version integer) RETURNS void
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
  -- AES-GCM: nonce 12 + tag 16 byte tối thiểu; key_version dương.
  IF p_ciphertext IS NULL OR octet_length(p_ciphertext) < 28 OR p_key_version IS NULL OR p_key_version < 1 THEN
    RAISE EXCEPTION 'invalid token payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO cf.shopify_stores AS s (workspace_id, shop_domain, access_token_enc, key_version, status)
  VALUES (v_ws, p_domain, p_ciphertext, p_key_version, 'connected')
  ON CONFLICT (workspace_id) DO UPDATE
    SET shop_domain = EXCLUDED.shop_domain,
        access_token_enc = EXCLUDED.access_token_enc,
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

CREATE FUNCTION cf.disconnect_shopify_store() RETURNS void
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
     SET access_token_enc = NULL, status = 'disconnected', last_sync_requested_at = NULL, updated_at = now()
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

-- Giữ thời gian chờ nguyên tử: trả true (và ghi mốc yêu cầu) chỉ khi kết nối đang `connected` và chưa yêu cầu trong 60 giây.
CREATE FUNCTION cf.request_shopify_sync() RETURNS boolean
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
   WHERE workspace_id = v_ws AND status = 'connected' AND access_token_enc IS NOT NULL
     AND (last_sync_requested_at IS NULL OR last_sync_requested_at < now() - interval '60 seconds');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END
$$;
--> statement-breakpoint

-- Đọc ciphertext: CHỈ đường hệ thống. Trả 0 hoặc 1 dòng (chưa kết nối/đã ngắt → 0 dòng).
CREATE FUNCTION cf.read_shopify_store_token()
RETURNS TABLE (shop_domain text, ciphertext bytea, key_version integer)
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
    SELECT s.shop_domain, s.access_token_enc, s.key_version
      FROM cf.shopify_stores s
     WHERE s.workspace_id = core.current_workspace_id()
       AND s.status = 'connected' AND s.access_token_enc IS NOT NULL;
END
$$;
--> statement-breakpoint

-- Ghi kết quả đồng bộ: CHỈ hệ thống. `token_invalid` hạ trạng thái xuống `invalid` (Owner thấy "cần nhập lại token").
CREATE FUNCTION cf.record_shopify_sync(p_result text, p_summary jsonb) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('ok', 'token_invalid', 'error', 'unavailable') THEN
    RAISE EXCEPTION 'invalid sync result' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.shopify_stores
     SET last_sync_result = p_result,
         last_sync_summary = COALESCE(p_summary, '{}'::jsonb),
         last_synced_at = CASE WHEN p_result = 'ok' THEN now() ELSE last_synced_at END,
         status = CASE WHEN p_result = 'token_invalid' AND status = 'connected' THEN 'invalid' ELSE status END,
         updated_at = now()
   WHERE workspace_id = core.current_workspace_id();
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.save_shopify_store(text, bytea, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.disconnect_shopify_store() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.request_shopify_sync() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.read_shopify_store_token() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.record_shopify_sync(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.save_shopify_store(text, bytea, integer) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.disconnect_shopify_store() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.request_shopify_sync() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.read_shopify_store_token() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.record_shopify_sync(text, jsonb) TO cf_app;

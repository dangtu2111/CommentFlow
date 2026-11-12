-- CHANNELS-SYSTEM-USER (Cài đặt › Kênh › Page thuộc Business): MỘT token System User Facebook mỗi workspace, lưu MÃ HÓA.
-- Vì sao: Page thuộc Business Portfolio không xuất hiện ở me/accounts khi đăng nhập bằng tài khoản cá nhân; System User (người dùng
-- hệ thống của Business, được gán Page) thì có. Token này KHÔNG hết hạn nên được lưu để "Kết nối lại"/liệt kê Page không phải dán lại.
-- Thiết kế quyền (mẫu 0064 shopify_stores, 0020 token kênh):
--   * cf.fb_system_connections: cf_app chỉ ĐỌC cột không bí mật (không `token_enc`, không `key_version`), chỉ Owner của workspace
--     (hoặc ngữ cảnh hệ thống) thấy dòng; KHÔNG có INSERT/UPDATE/DELETE trực tiếp.
--   * Ghi qua hàm SECURITY DEFINER (search_path cố định, REVOKE PUBLIC, GRANT cf_app):
--       save_fb_system_connection / disconnect_fb_system_connection = Owner đang hoạt động (withActor) hoặc hệ thống;
--       read_fb_system_connection_token / mark_fb_system_connection_invalid = CHỈ hệ thống (withJob).
--     Web chỉ đọc ciphertext qua withJob SAU KHI requireAppUser({role:'owner'}) đã kiểm Owner (cùng cách `setFlag` của kênh).
--   * Mã hóa ở tầng ứng dụng (AES-256-GCM, TOKEN_ENC_KEYS), AAD có workspace_id; gói DB chỉ chuyển bytea.
--   * Mọi lần lưu/ngắt ghi core.action_logs (không có token).
-- Đường lùi (bảng mới, chưa có dữ liệu cũ): DROP FUNCTION cf.save_fb_system_connection(bytea, integer),
--   cf.disconnect_fb_system_connection(), cf.read_fb_system_connection_token(), cf.mark_fb_system_connection_invalid();
--   DROP TABLE cf.fb_system_connections (MẤT token đã lưu; kênh đã kết nối giữ nguyên vì dùng token Page riêng).
CREATE TABLE "cf"."fb_system_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token_enc" bytea,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fb_system_connections_workspace_unique" UNIQUE("workspace_id"),
	CONSTRAINT "fb_system_connections_status_check" CHECK ("cf"."fb_system_connections"."status" IN ('connected', 'invalid', 'disconnected'))
);
--> statement-breakpoint
ALTER TABLE "cf"."fb_system_connections" ADD CONSTRAINT "fb_system_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE cf.fb_system_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT (id, workspace_id, status, created_at, updated_at) ON cf.fb_system_connections TO cf_app;
--> statement-breakpoint
CREATE POLICY fb_system_connections_select ON cf.fb_system_connections FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint

CREATE FUNCTION cf.save_fb_system_connection(p_ciphertext bytea, p_key_version integer) RETURNS void
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
  -- AES-GCM: nonce 12 + tag 16 byte tối thiểu; key_version dương.
  IF p_ciphertext IS NULL OR octet_length(p_ciphertext) < 28 OR p_key_version IS NULL OR p_key_version < 1 THEN
    RAISE EXCEPTION 'invalid token payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO cf.fb_system_connections AS s (workspace_id, token_enc, key_version, status)
  VALUES (v_ws, p_ciphertext, p_key_version, 'connected')
  ON CONFLICT (workspace_id) DO UPDATE
    SET token_enc = EXCLUDED.token_enc,
        key_version = EXCLUDED.key_version,
        status = 'connected',
        updated_at = now()
  RETURNING (xmax = 0) INTO v_inserted;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (
    v_ws,
    CASE WHEN v_system THEN 'system' ELSE 'user' END,
    CASE WHEN v_system THEN NULL ELSE core.current_user_id() END,
    CASE WHEN v_inserted THEN 'fb_system_user.connected' ELSE 'fb_system_user.reconnected' END,
    'fb_system_connection', v_ws::text,
    jsonb_build_object('key_version', p_key_version)
  );
END
$$;
--> statement-breakpoint

CREATE FUNCTION cf.disconnect_fb_system_connection() RETURNS void
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
  UPDATE cf.fb_system_connections
     SET token_enc = NULL, status = 'disconnected', updated_at = now()
   WHERE workspace_id = v_ws;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fb system connection not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
  VALUES (
    v_ws,
    CASE WHEN v_system THEN 'system' ELSE 'user' END,
    CASE WHEN v_system THEN NULL ELSE core.current_user_id() END,
    'fb_system_user.disconnected', 'fb_system_connection', v_ws::text
  );
END
$$;
--> statement-breakpoint

-- Đọc ciphertext: CHỈ đường hệ thống. Trả 0 hoặc 1 dòng (chưa lưu/đã ngắt/đã hỏng → 0 dòng).
CREATE FUNCTION cf.read_fb_system_connection_token()
RETURNS TABLE (ciphertext bytea, key_version integer)
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
    SELECT s.token_enc, s.key_version
      FROM cf.fb_system_connections s
     WHERE s.workspace_id = core.current_workspace_id()
       AND s.status = 'connected' AND s.token_enc IS NOT NULL;
END
$$;
--> statement-breakpoint

-- Meta từ chối token (hết hiệu lực/bị thu hồi): hạ xuống `invalid` để giao diện báo "cần dán token mới". CHỈ hệ thống.
CREATE FUNCTION cf.mark_fb_system_connection_invalid() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE cf.fb_system_connections
     SET status = 'invalid', updated_at = now()
   WHERE workspace_id = core.current_workspace_id() AND status = 'connected';
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.save_fb_system_connection(bytea, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.disconnect_fb_system_connection() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.read_fb_system_connection_token() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.mark_fb_system_connection_invalid() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.save_fb_system_connection(bytea, integer) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.disconnect_fb_system_connection() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.read_fb_system_connection_token() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.mark_fb_system_connection_invalid() TO cf_app;

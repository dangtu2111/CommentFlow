-- ===================================================================================================
-- TOKEN-ENC (feat/token-enc): bốn hàm SECURITY DEFINER hẹp cho token Page (ADR 007 §2, docs/13 §5).
--  * cf_app KHÔNG có quyền cột nào trên access_token_enc/key_version (0019) → mọi ghi/đọc token đi qua các hàm này.
--  * Việc mã hóa/giải mã AES-256-GCM chạy trong mã ứng dụng (khóa không bao giờ vào DB). Hàm chỉ nhận/trả ciphertext.
--  * cf.create_channel / set_channel_token / clear_channel_token: Owner đang hoạt động HOẶC hệ thống (withJob).
--    Web ghi token ngay ở callback OAuth và xóa khi ngắt kết nối; web KHÔNG đọc được ciphertext.
--  * cf.read_channel_token: CHỈ hệ thống (withJob/worker). Owner/Staff/withWorkspace trần bị từ chối (42501).
--  * Mọi hàm chỉ chạm kênh của workspace hiện tại (app.workspace_id); kênh workspace khác → không tìm thấy (P0002).
--  * Hàm không ghi ciphertext/token vào action_logs hay thông báo lỗi.
--  * Bảo mật hàm: search_path cố định (pg_catalog, core, cf, pg_temp), REVOKE ALL FROM PUBLIC, chỉ GRANT EXECUTE cf_app.
--
-- Đường lùi: DROP bốn hàm TRƯỚC (chúng chỉ an toàn nhờ is_system_context() đã COALESCE), rồi mới khôi phục hai hàm về bản 0019;
-- DROP FUNCTION cf.create_channel(text, text, text, text, text[]), cf.set_channel_token(uuid, bytea, integer,
-- timestamptz), cf.clear_channel_token(uuid), cf.read_channel_token(uuid) (không đổi bảng).
-- ===================================================================================================

-- Sửa kèm (phát hiện khi viết test): trigger cf.guard_channel_user_update (0019) chặn MỌI UPDATE cột hệ thống khi
-- không phải ngữ cảnh hệ thống — kể cả khi chính các hàm DEFINER dưới đây (đã tự kiểm Owner/hệ thống) cập nhật. Trigger
-- chỉ miễn cho CHỦ BẢNG (bên trong hàm DEFINER current_user = chủ hàm = chủ bảng; role nào khác — cf_app, role Admin/worker
-- tương lai — vẫn bị chặn: fail-closed). cf_app không đổi được current_user (không SET ROLE tới chủ bảng).
-- Cũng làm cứng core.is_system_context(): current_setting(...) = 'system' trả NULL khi GUC chưa từng đặt, làm
-- "NOT is_system_context()" thành NULL (trigger không chặn). COALESCE(..., false) → luôn true/false.
CREATE OR REPLACE FUNCTION core.is_system_context() RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT COALESCE(current_setting('app.ctx', true) = 'system' AND core.current_user_id() IS NULL, false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cf.guard_channel_user_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Chủ bảng (hàm DEFINER đã tự kiểm quyền; migration/admin) được qua; mọi role khác bị chặn ngoài ngữ cảnh hệ thống.
  IF current_user IS DISTINCT FROM pg_get_userbyid((SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID))
     AND NOT core.is_system_context() AND (
       NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
    OR NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
    OR NEW.scopes IS DISTINCT FROM OLD.scopes
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.webhook_subscribed IS DISTINCT FROM OLD.webhook_subscribed
    OR NEW.capabilities IS DISTINCT FROM OLD.capabilities
    OR NEW.last_polled_at IS DISTINCT FROM OLD.last_polled_at
  ) THEN
    RAISE EXCEPTION 'channels: cột do hệ thống quản lý, người dùng chỉ sửa name và reply_language'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE FUNCTION cf.create_channel(
  p_platform text, p_external_id text, p_name text, p_avatar_url text, p_scopes text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_user uuid := core.current_user_id();
  v_system boolean := core.is_system_context();
  v_id uuid;
  v_inserted boolean;
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR v_system) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO cf.channels AS c (workspace_id, platform, external_id, name, avatar_url, scopes, status)
  VALUES (v_ws, p_platform, p_external_id, p_name, p_avatar_url, COALESCE(p_scopes, '{}'::text[]), 'connected')
  ON CONFLICT (platform, external_id, workspace_id) DO UPDATE
    SET name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        scopes = EXCLUDED.scopes,
        status = 'connected',
        updated_at = now()
  RETURNING c.id, (xmax = 0) INTO v_id, v_inserted;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (
    v_ws,
    CASE WHEN v_system THEN 'system' ELSE 'user' END,
    CASE WHEN v_system THEN NULL ELSE v_user END,
    CASE WHEN v_inserted THEN 'channel.connected' ELSE 'channel.reconnected' END,
    'channel', v_id::text,
    jsonb_build_object('platform', p_platform, 'external_id', p_external_id)
  );
  RETURN v_id;
END
$$;
--> statement-breakpoint

CREATE FUNCTION cf.set_channel_token(
  p_channel_id uuid, p_ciphertext bytea, p_key_version integer, p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR core.is_system_context()) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  -- AES-GCM: nonce 12 + tag 16 byte tối thiểu; key_version dương.
  IF p_ciphertext IS NULL OR octet_length(p_ciphertext) < 28 OR p_key_version IS NULL OR p_key_version < 1 THEN
    RAISE EXCEPTION 'invalid token payload' USING ERRCODE = '22023';
  END IF;

  UPDATE cf.channels
     SET access_token_enc = p_ciphertext,
         key_version = p_key_version,
         token_expires_at = p_expires_at,
         updated_at = now()
   WHERE id = p_channel_id AND workspace_id = v_ws;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'channel not found' USING ERRCODE = 'P0002';
  END IF;

  -- Dấu vết kiểm toán thay token (KHÔNG kèm ciphertext).
  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (
    v_ws,
    CASE WHEN core.is_system_context() THEN 'system' ELSE 'user' END,
    CASE WHEN core.is_system_context() THEN NULL ELSE core.current_user_id() END,
    'channel.token_set', 'channel', p_channel_id::text,
    jsonb_build_object('key_version', p_key_version)
  );
END
$$;
--> statement-breakpoint

CREATE FUNCTION cf.clear_channel_token(p_channel_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_user uuid := core.current_user_id();
  v_system boolean := core.is_system_context();
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR v_system) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE cf.channels
     SET access_token_enc = NULL,
         token_expires_at = NULL,
         status = 'revoked',
         webhook_subscribed = false,
         updated_at = now()
   WHERE id = p_channel_id AND workspace_id = v_ws;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'channel not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
  VALUES (
    v_ws,
    CASE WHEN v_system THEN 'system' ELSE 'user' END,
    CASE WHEN v_system THEN NULL ELSE v_user END,
    'channel.token_cleared', 'channel', p_channel_id::text
  );
END
$$;
--> statement-breakpoint

-- Đọc ciphertext: CHỈ đường hệ thống. Trả đúng 0 hoặc 1 dòng (kênh chưa có token → 0 dòng).
CREATE FUNCTION cf.read_channel_token(p_channel_id uuid)
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
    SELECT c.access_token_enc, c.key_version
      FROM cf.channels c
     WHERE c.id = p_channel_id
       AND c.workspace_id = core.current_workspace_id()
       AND c.access_token_enc IS NOT NULL;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.create_channel(text, text, text, text, text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_channel_token(uuid, bytea, integer, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.clear_channel_token(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.read_channel_token(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.create_channel(text, text, text, text, text[]) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_channel_token(uuid, bytea, integer, timestamptz) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.clear_channel_token(uuid) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.read_channel_token(uuid) TO cf_app;

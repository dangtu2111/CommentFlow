-- CHANNEL-AVATAR: ảnh đại diện của kênh (Page Facebook). Cột `cf.channels.avatar_url` đã có từ 0019 nhưng chưa có đường ghi cho worker.
-- Hàm DEFINER CHỈ cho hệ thống (worker `withJob`, ngữ cảnh workspace): ghi URL https ≤ 2048 ký tự cho đúng kênh của workspace; trả true nếu đã ghi.
-- Ảnh đại diện của Page là thông tin công khai của Page (không phải dữ liệu cá nhân của khách).
-- Chỉ THÊM hàm. Đường lùi: DROP FUNCTION cf.set_channel_avatar(uuid, text); (cột giữ nguyên, URL đã ghi có thể để lại hoặc UPDATE cf.channels SET avatar_url = NULL).
CREATE FUNCTION cf.set_channel_avatar(p_channel_id uuid, p_url text) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_channel_id IS NULL OR p_url IS NULL OR p_url !~ '^https://[^[:space:]]+$' OR length(p_url) > 2048 THEN
    RAISE EXCEPTION 'invalid avatar url' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.channels
     SET avatar_url = p_url, updated_at = now()
   WHERE id = p_channel_id AND workspace_id = v_ws AND avatar_url IS DISTINCT FROM p_url;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_channel_avatar(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_channel_avatar(uuid, text) TO cf_app;

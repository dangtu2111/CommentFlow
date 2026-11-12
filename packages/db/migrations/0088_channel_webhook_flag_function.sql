-- CHANNEL-WEBHOOK-FLAG: web chỉ có kết nối cf_app nên `withJob` không phải ngữ cảnh hệ thống (ADR 011, migration 0030); trigger
-- cf.guard_channel_user_update chặn người dùng đổi `webhook_subscribed` → bước kết nối Page ở web không đặt/xóa được cờ (kênh tạo xong nhưng
-- "chưa đăng ký webhook" dù Meta đã đăng ký). Hàm DEFINER cho OWNER đang hoạt động (hoặc hệ thống) đổi cờ của MỘT kênh Facebook `connected`
-- trong workspace hiện tại; chủ bảng (hàm DEFINER) được trigger cho qua. Trigger và quyền cột giữ nguyên: người dùng vẫn không UPDATE trực tiếp.
-- Rủi ro đã cân nhắc: Owner có thể đặt cờ `true` mà chưa đăng ký thật với Meta — chỉ ảnh hưởng kênh của chính họ (Meta chỉ gửi sự kiện cho Page đã
-- đăng ký thật; cờ chỉ quyết định định tuyến sự kiện đến workspace và nhãn giao diện). Nơi gọi chỉ đặt `true` sau khi xác nhận đăng ký.
-- Đường lùi: DROP FUNCTION cf.set_channel_webhook_subscribed(uuid, boolean).
CREATE FUNCTION cf.set_channel_webhook_subscribed(p_channel_id uuid, p_value boolean) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_system boolean := core.is_system_context();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR (core.is_workspace_owner() OR v_system) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_channel_id IS NULL OR p_value IS NULL THEN
    RAISE EXCEPTION 'invalid arguments' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.channels
     SET webhook_subscribed = p_value, updated_at = now()
   WHERE id = p_channel_id AND workspace_id = v_ws
     AND platform = 'facebook' AND status = 'connected';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
    VALUES (
      v_ws,
      CASE WHEN v_system THEN 'system' ELSE 'user' END,
      CASE WHEN v_system THEN NULL ELSE core.current_user_id() END,
      CASE WHEN p_value THEN 'channel.webhook_subscribed' ELSE 'channel.webhook_cleared' END,
      'channel', p_channel_id::text,
      jsonb_build_object('webhook_subscribed', p_value)
    );
  END IF;
  RETURN v_rows = 1;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_channel_webhook_subscribed(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_channel_webhook_subscribed(uuid, boolean) TO cf_app;

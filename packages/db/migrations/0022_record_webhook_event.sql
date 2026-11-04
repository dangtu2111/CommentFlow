-- ===================================================================================================
-- WH-INGEST (feat/wh-ingest): cf.record_webhook_event — ghi sự kiện webhook và rải theo kênh (FR-020/021, ADR 007 §4).
--  * Webhook đến TRƯỚC khi biết workspace nào sở hữu Page, và không có người dùng đăng nhập: route web (sau khi kiểm chữ ký
--    X-Hub-Signature-256) gọi hàm này trong ngữ cảnh TRẦN (withSystem: không workspace, không người dùng, không job).
--    Mọi ngữ cảnh khác (withWorkspace, withActor, withJob, withUser) → 42501: không đường nào khác tiêm được sự kiện sang
--    workspace khác (cf_app không có INSERT trực tiếp trên webhook_events).
--  * Mỗi kênh `connected` + `webhook_subscribed` khớp (platform, external_id) → MỘT dòng cho workspace của kênh (một Page ở
--    nhiều workspace → nhiều dòng). `webhook_subscribed` chỉ đường hệ thống đặt được (trigger guard_channel_user_update) nên
--    Owner không tự nhận webhook của Page mình không sở hữu bằng cách ghi token tùy ý.
--  * Không kênh nào khớp → MỘT dòng workspace_id NULL (không workspace nào thấy; không trả về → không enqueue).
--  * Idempotent: ON CONFLICT (event_hash, workspace_id) DO NOTHING; chỉ trả các dòng MỚI.
--  * Hàm KHÔNG trả payload, không đọc gì cho người gọi ngoài (event_id, workspace_id) của dòng mới.
--  * Bảo mật hàm: search_path cố định (có pg_temp), REVOKE ALL FROM PUBLIC, chỉ GRANT EXECUTE cf_app.
--
-- Đường lùi: DROP FUNCTION cf.record_webhook_event(text, text, text, jsonb) (không đổi bảng).
-- ===================================================================================================

CREATE FUNCTION cf.record_webhook_event(
  p_platform text, p_page_external_id text, p_event_hash text, p_payload jsonb
) RETURNS TABLE (event_id uuid, event_workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_mapped integer;
BEGIN
  -- Chỉ ngữ cảnh trần: không workspace, không người dùng, không phải job hệ thống (fail-closed với NULL).
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    WITH targets AS (
      SELECT DISTINCT c.workspace_id
        FROM cf.channels c
       WHERE c.platform = p_platform
         AND c.external_id = p_page_external_id
         AND c.status = 'connected'
         AND c.webhook_subscribed
    ), ins AS (
      INSERT INTO cf.webhook_events AS w (workspace_id, platform, event_hash, payload)
      SELECT t.workspace_id, p_platform, p_event_hash, p_payload FROM targets t
      ON CONFLICT (event_hash, workspace_id) DO NOTHING
      RETURNING w.id, w.workspace_id
    )
    SELECT ins.id, ins.workspace_id FROM ins;

  SELECT count(*) INTO v_mapped
    FROM cf.channels c
   WHERE c.platform = p_platform
     AND c.external_id = p_page_external_id
     AND c.status = 'connected'
     AND c.webhook_subscribed;

  IF v_mapped = 0 THEN
    -- Chưa map được kênh: lưu một dòng không workspace (NULLS NOT DISTINCT → chỉ một dòng cho mỗi event_hash).
    INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload)
    VALUES (NULL, p_platform, p_event_hash, p_payload)
    ON CONFLICT (event_hash, workspace_id) DO NOTHING;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.record_webhook_event(text, text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.record_webhook_event(text, text, text, jsonb) TO cf_app;

-- ===================================================================================================
-- WH-INGEST (feat/wh-ingest): cf.record_webhook_event — ghi sự kiện webhook và rải theo kênh (FR-020/021, ADR 007 §4).
--  * Webhook đến TRƯỚC khi biết workspace nào sở hữu Page, và không có người dùng đăng nhập: route web (sau khi kiểm chữ ký
--    X-Hub-Signature-256) gọi hàm này trong ngữ cảnh TRẦN (withSystem: không workspace, không người dùng, không job).
--    Mọi ngữ cảnh khác (withWorkspace, withActor, withJob, withUser) → 42501.
--  * Hàm là ĐƯỜNG GHI DUY NHẤT của cf.webhook_events: migration này thu hồi INSERT trực tiếp của cf_app (0019 cấp INSERT +
--    policy cho withJob) — không còn đường nào khác tiêm sự kiện.
--  * Mỗi kênh `connected` + `webhook_subscribed` khớp (platform, external_id) → MỘT dòng cho workspace của kênh (một Page ở
--    nhiều workspace → nhiều dòng). `webhook_subscribed` chỉ đường hệ thống đặt được (trigger guard_channel_user_update).
--  * Không kênh nào khớp → MỘT dòng workspace_id NULL, payload `{}` (không lưu PII của Page chưa/không còn kết nối),
--    status `dead` + error `unmapped_page` (job quét/thử lại không đụng tới; không trả về → không enqueue).
--  * Idempotent và AN TOÀN KHI GỬI LẠI: trả các dòng MỚI cùng các dòng đã có nhưng CHƯA XONG (`received`/`failed`) — nếu bước
--    enqueue ở route lỗi sau khi đã ghi, lần Meta gửi lại sẽ enqueue lại (worker idempotent). Dòng `done`/`dead` không trả.
--  * Chèn theo thứ tự workspace_id cố định (tránh deadlock khi hai giao dịch cùng rải một sự kiện); toàn bộ trong MỘT câu
--    lệnh (cùng snapshot → không có khe giữa "đếm kênh" và "chèn").
--  * Bảo mật hàm: search_path cố định (có pg_temp), REVOKE ALL FROM PUBLIC, chỉ GRANT EXECUTE cf_app.
--
-- Đường lùi: DROP FUNCTION cf.record_webhook_event(text, text, text, jsonb); khôi phục INSERT trực tiếp:
-- GRANT INSERT ON cf.webhook_events TO cf_app; CREATE POLICY webhook_events_insert ON cf.webhook_events FOR INSERT
-- WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_system_context()));
-- ===================================================================================================

CREATE FUNCTION cf.record_webhook_event(
  p_platform text, p_page_external_id text, p_event_hash text, p_payload jsonb
) RETURNS TABLE (event_id uuid, event_workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
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
      SELECT t.workspace_id, p_platform, p_event_hash, p_payload FROM targets t ORDER BY t.workspace_id
      ON CONFLICT (event_hash, workspace_id) DO NOTHING
      RETURNING w.id, w.workspace_id
    ), unmapped AS (
      INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status, error)
      SELECT NULL, p_platform, p_event_hash, '{}'::jsonb, 'dead', 'unmapped_page'
       WHERE NOT EXISTS (SELECT 1 FROM targets)
      ON CONFLICT (event_hash, workspace_id) DO NOTHING
      RETURNING 1
    )
    SELECT ins.id, ins.workspace_id FROM ins
    UNION
    SELECT e.id, e.workspace_id
      FROM cf.webhook_events e
     WHERE e.event_hash = p_event_hash
       AND e.workspace_id IN (SELECT t.workspace_id FROM targets t)
       AND e.status IN ('received', 'failed');
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.record_webhook_event(text, text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.record_webhook_event(text, text, text, jsonb) TO cf_app;
--> statement-breakpoint

-- Hàm trên là đường ghi duy nhất: thu hồi INSERT trực tiếp (0019) và policy tương ứng.
DROP POLICY webhook_events_insert ON cf.webhook_events;
--> statement-breakpoint
REVOKE INSERT ON cf.webhook_events FROM cf_app;

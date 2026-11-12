-- CHANNELS-SYSTEM-USER (sửa thiết kế của 0086): web chỉ có kết nối cf_app; từ migration 0030 (ADR 011) `withJob` trên pool cf_app KHÔNG phải
-- ngữ cảnh hệ thống nên web không đọc được ciphertext token System User bằng đường hệ thống (fail-closed) → không liệt kê được Page.
-- Cho phép OWNER của workspace (đường `withActor`) đọc ciphertext và đánh dấu token hỏng, ngoài ngữ cảnh hệ thống. Staff/người lạ vẫn bị
-- từ chối (42501); cô lập workspace giữ nguyên (chỉ dòng của workspace hiện tại). Web vốn đã giữ khóa giải mã (TOKEN_ENC_KEYS) và thấy token
-- lúc Owner dán, nên không mở thêm bề mặt đáng kể; cf_app vẫn KHÔNG có quyền cột trực tiếp trên `token_enc`.
-- Đường lùi: chạy lại hai CREATE OR REPLACE dưới đây với điều kiện `core.is_system_context() IS NOT TRUE` như bản 0086.
CREATE OR REPLACE FUNCTION cf.read_fb_system_connection_token()
RETURNS TABLE (ciphertext bytea, key_version integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NULL OR (core.is_workspace_owner() OR core.is_system_context()) IS NOT TRUE THEN
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

CREATE OR REPLACE FUNCTION cf.mark_fb_system_connection_invalid() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NULL OR (core.is_workspace_owner() OR core.is_system_context()) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE cf.fb_system_connections
     SET status = 'invalid', updated_at = now()
   WHERE workspace_id = core.current_workspace_id() AND status = 'connected';
END
$$;

-- SHOPIFY-CONNECT-STORE: lỗi ĐỌC SẢN PHẨM (token đã đổi được, tức Client ID/secret ĐÚNG, nhưng Shopify từ chối vì thiếu quyền
-- read_products/read_inventory hoặc chưa phát hành/cài lại phiên bản) KHÔNG được hạ kết nối xuống `invalid`: Owner chỉ cần sửa quyền ở
-- Dev Dashboard rồi bấm "Đồng bộ ngay" lại, không phải nhập lại Client ID/secret. Chỉ lỗi ở bước ĐỔI TOKEN hoặc giải mã
-- (reason không bắt đầu bằng `catalog:`) mới đặt `invalid`.
-- Đường lùi: chạy lại phần CREATE OR REPLACE FUNCTION cf.record_shopify_sync của 0064.
CREATE OR REPLACE FUNCTION cf.record_shopify_sync(p_result text, p_summary jsonb) RETURNS void
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
         status = CASE
                    WHEN p_result = 'token_invalid' AND status = 'connected'
                         AND COALESCE(p_summary ->> 'reason', '') NOT LIKE 'catalog:%'
                    THEN 'invalid'
                    ELSE status
                  END,
         updated_at = now()
   WHERE workspace_id = core.current_workspace_id();
END
$$;

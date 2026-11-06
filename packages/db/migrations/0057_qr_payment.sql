SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD COLUMN "transfer_reported_at" timestamp with time zone;--> statement-breakpoint

-- ===================================================================================================
-- QR-PAYMENT (FR-091, US-061, UF-9, Q-QRP1) — feat-qr-payment. Trạng thái "chờ xác nhận" của hóa đơn chuyển khoản.
--
--  * core.invoices.transfer_reported_at: mốc Owner bấm "Tôi đã chuyển khoản". Hóa đơn `pending` có mốc này hiển thị là
--    "chờ xác nhận"; hóa đơn chỉ thành `paid` khi Admin/hệ thống xác nhận đúng số tiền (core.confirm_invoice_payment, 0052).
--    Đây là TUYÊN BỐ của người dùng, KHÔNG phải bằng chứng đã nhận tiền: không đổi `status`, không cộng lượt/gói.
--  * core.report_invoice_transfer(p_workspace_id, p_invoice_id): SECURITY DEFINER, đường Owner (mẫu 0055): người dùng lấy
--    từ core.current_user_id() (KHÔNG nhận user id), đòi workspace ngữ cảnh = tham số, không phải đường hệ thống và
--    core.is_workspace_owner(); sai → 42501. Hóa đơn của workspace khác/không tồn tại → P0002 (không lộ tồn tại).
--    Trả 'ok' (lần đầu), 'already_reported' (idempotent, giữ mốc đầu), 'paid', 'void' (không đổi gì). Khóa dòng
--    (FOR UPDATE) nên hai lần bấm đồng thời chỉ một lần ghi. Ghi action_logs (invoice.transfer_reported).
--    EXECUTE: chỉ cf_app (cf_worker kế thừa gián tiếp, vô hại vì hàm đòi người dùng); PUBLIC/cf_auth không có.
--
-- TRIỂN KHAI: migrate trước; web chưa gọi hàm cho tới khi QR_PAYMENT_ENABLED=true (mặc định TẮT).
-- Đường lùi: DROP FUNCTION core.report_invoice_transfer(uuid, uuid); ALTER TABLE core.invoices DROP COLUMN
-- transfer_reported_at; lùi check-rls.ts. Mất mốc "đã báo chuyển khoản" đã ghi (hóa đơn vẫn nguyên).
-- ===================================================================================================
CREATE FUNCTION core.report_invoice_transfer(p_workspace_id uuid, p_invoice_id uuid) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_inv core.invoices%ROWTYPE;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL OR p_invoice_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id
     OR core.is_system_context() IS NOT FALSE
     OR NOT core.is_workspace_owner() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM core.invoices i
   WHERE i.id = p_invoice_id AND i.workspace_id = p_workspace_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN v_inv.status;
  END IF;
  IF v_inv.transfer_reported_at IS NOT NULL THEN
    RETURN 'already_reported';
  END IF;

  UPDATE core.invoices SET transfer_reported_at = now(), updated_at = now() WHERE id = v_inv.id;
  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (p_workspace_id, 'user', v_user, 'invoice.transfer_reported', 'invoice', v_inv.id::text,
          jsonb_build_object('invoice_number', v_inv.number, 'amount_vnd', v_inv.amount_vnd));
  RETURN 'ok';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.report_invoice_transfer(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.report_invoice_transfer(uuid, uuid) TO cf_app;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

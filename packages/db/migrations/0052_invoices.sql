SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE SEQUENCE "core"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "core"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product" text NOT NULL,
	"number" text NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"items" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"transfer_code" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_transfer_code_unique" UNIQUE("transfer_code"),
	CONSTRAINT "invoices_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "invoices_product_check" CHECK ("core"."invoices"."product" in ('commentflow', 'excelflow')),
	CONSTRAINT "invoices_status_check" CHECK ("core"."invoices"."status" in ('pending', 'paid', 'void')),
	CONSTRAINT "invoices_amount_check" CHECK ("core"."invoices"."amount_vnd" between 1 and 1000000000),
	CONSTRAINT "invoices_number_check" CHECK ("core"."invoices"."number" ~ '^INV-[0-9]{6}-[0-9]{6,}$'),
	CONSTRAINT "invoices_transfer_code_check" CHECK ("core"."invoices"."transfer_code" ~ '^(CF|XF)[A-HJ-NP-Z2-9]{8}$' and left("core"."invoices"."transfer_code", 2) = case "core"."invoices"."product" when 'commentflow' then 'CF' else 'XF' end),
	CONSTRAINT "invoices_items_check" CHECK (jsonb_typeof("core"."invoices"."items") = 'array'),
	CONSTRAINT "invoices_state_check" CHECK (("core"."invoices"."status" = 'paid') = ("core"."invoices"."paid_at" is not null) and ("core"."invoices"."status" = 'void') = ("core"."invoices"."voided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "core"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"bank_ref" text NOT NULL,
	"raw_statement" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_invoice_unique" UNIQUE("invoice_id"),
	CONSTRAINT "payments_bank_ref_unique" UNIQUE("bank_ref"),
	CONSTRAINT "payments_amount_check" CHECK ("core"."payments"."amount_vnd" between 1 and 1000000000),
	CONSTRAINT "payments_bank_ref_check" CHECK (char_length("core"."payments"."bank_ref") between 1 and 100),
	CONSTRAINT "payments_raw_statement_check" CHECK ("core"."payments"."raw_statement" is null or char_length("core"."payments"."raw_statement") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."payments" ADD CONSTRAINT "payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."payments" ADD CONSTRAINT "payments_invoice_fk" FOREIGN KEY ("workspace_id","invoice_id") REFERENCES "core"."invoices"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_workspace_idx" ON "core"."invoices" USING btree ("workspace_id","created_at");--> statement-breakpoint
-- ===================================================================================================
-- INVOICES (FR-091/FR-102, docs/10 §3.6, Q-INV1) — feat-invoices. Hóa đơn + xác nhận thanh toán thủ công.
--
--  * core.invoices / core.payments: cf_app CHỈ ĐỌC (GRANT SELECT). KHÔNG có policy/GRANT INSERT/UPDATE/DELETE.
--    Đọc: Owner của đúng workspace (thanh toán là việc của Owner, đường `withActor`), hoặc ngữ cảnh HỆ THỐNG
--    (`withJob` trên cf_worker). `withWorkspace` trần và Staff KHÔNG đọc được (quên withActor → 0 dòng, không lộ tiền).
--    `payments`: GRANT SELECT theo cột — KHÔNG cấp `raw_statement` (sao kê gốc, có PII) và `confirmed_by`.
--  * Ghi duy nhất qua 3 hàm SECURITY DEFINER (chủ bảng bỏ qua RLS): core.create_invoice, core.confirm_invoice_payment,
--    core.void_invoice. Quyền gọi (mẫu core.consume_usage, 0039): chỉ kết nối cf_worker (session_user), ngữ cảnh job HỆ
--    THỐNG không có người dùng, workspace ngữ cảnh = p_workspace_id. EXECUTE thu hồi khỏi PUBLIC và cf_app, chỉ cấp
--    cf_worker. search_path cố định có pg_temp. Đầu vào sai → 22023. Đường Admin (ADMIN-SHELL) sẽ gọi qua hàm bao riêng.
--  * Tổng tiền: DB tính lại Σ(quantity × unit_price_vnd) từ items và đòi bằng p_amount_vnd (nơi gọi không khai gian).
--  * Xác nhận: khóa dòng hóa đơn (FOR UPDATE); CHỈ hóa đơn pending + ĐÚNG số tiền mới thành paid (kèm một dòng payments);
--    lệch tiền → KHÔNG đổi gì, trả 'amount_mismatch'; đã trả → trả 'already_paid' (idempotent); hủy → 'void'.
--    bank_ref duy nhất toàn hệ thống: dùng lại cho hóa đơn khác → 23505 (một giao dịch ngân hàng không tính hai lần).
--
-- TRIỂN KHAI: migrate trước; chưa có nơi gọi trong runtime (web/worker) nên không cần phối hợp bản chạy.
-- Đường lùi: DROP FUNCTION core.void_invoice(uuid, uuid), core.confirm_invoice_payment(uuid, uuid, bigint, text, text, uuid),
-- core.create_invoice(uuid, text, bigint, jsonb, text, timestamptz); DROP TABLE core.payments, core.invoices;
-- DROP SEQUENCE core.invoice_number_seq; và lùi check-rls.ts. Mất dữ liệu hóa đơn đã tạo.
-- ===================================================================================================

ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON core.invoices TO cf_app;
--> statement-breakpoint
GRANT SELECT (id, workspace_id, invoice_id, amount_vnd, bank_ref, confirmed_at, created_at) ON core.payments TO cf_app;
--> statement-breakpoint
CREATE POLICY invoices_select ON core.invoices FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_owner()))
  );
--> statement-breakpoint
CREATE POLICY payments_select ON core.payments FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_owner()))
  );
--> statement-breakpoint

CREATE FUNCTION core.create_invoice(
  p_workspace_id uuid, p_product text, p_amount_vnd bigint, p_items jsonb, p_transfer_code text, p_due_at timestamptz
) RETURNS TABLE (invoice_id uuid, invoice_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_sum bigint;
  v_number text;
  v_id uuid;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('commentflow', 'excelflow')
     OR p_amount_vnd IS NULL OR p_amount_vnd < 1 OR p_amount_vnd > 1000000000
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 20
     OR p_transfer_code IS NULL OR p_transfer_code !~ '^(CF|XF)[A-HJ-NP-Z2-9]{8}$'
     OR p_due_at IS NULL OR p_due_at <= now() THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;

  -- Mỗi mục phải là object có description (chuỗi ≤ 200), quantity (số nguyên 1–9999), unit_price_vnd (số nguyên ≥ 0,
  -- ≤ 10 chữ số): chặn số âm/thiếu trường/không phải số TRƯỚC khi cast (tránh 22P02/22003, tổng không bị NULL bỏ qua).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS e
     WHERE jsonb_typeof(e) <> 'object'
        OR jsonb_typeof(e -> 'description') IS DISTINCT FROM 'string'
        OR char_length(e ->> 'description') NOT BETWEEN 1 AND 200
        OR jsonb_typeof(e -> 'quantity') IS DISTINCT FROM 'number'
        OR (e ->> 'quantity') !~ '^[1-9][0-9]{0,3}$'
        OR jsonb_typeof(e -> 'unit_price_vnd') IS DISTINCT FROM 'number'
        OR (e ->> 'unit_price_vnd') !~ '^[0-9]{1,10}$'
  ) THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  SELECT sum((e ->> 'quantity')::bigint * (e ->> 'unit_price_vnd')::bigint)
    INTO v_sum
    FROM jsonb_array_elements(p_items) AS e;
  IF v_sum IS DISTINCT FROM p_amount_vnd THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;

  v_number := 'INV-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMM') || '-'
              || lpad(nextval('core.invoice_number_seq')::text, 6, '0');
  INSERT INTO core.invoices (workspace_id, product, number, amount_vnd, items, transfer_code, due_at)
  VALUES (p_workspace_id, p_product, v_number, p_amount_vnd, p_items, p_transfer_code, p_due_at)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_number;
END
$$;
--> statement-breakpoint

CREATE FUNCTION core.confirm_invoice_payment(
  p_workspace_id uuid, p_invoice_id uuid, p_amount_vnd bigint, p_bank_ref text, p_raw_statement text,
  p_confirmed_by uuid
) RETURNS TABLE (result text, payment_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_inv core.invoices%ROWTYPE;
  v_payment uuid;
  v_ref text;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_invoice_id IS NULL
     OR p_amount_vnd IS NULL OR p_amount_vnd < 1 OR p_amount_vnd > 1000000000
     OR p_bank_ref IS NULL OR char_length(btrim(p_bank_ref)) NOT BETWEEN 1 AND 100
     OR (p_raw_statement IS NOT NULL AND char_length(p_raw_statement) > 2000) THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  -- Chuẩn hóa mã giao dịch (hoa + bỏ khoảng trắng đầu/cuối) để `FT1`, `ft1`, ` FT1 ` là MỘT giao dịch (unique bank_ref).
  v_ref := upper(btrim(p_bank_ref));

  SELECT * INTO v_inv FROM core.invoices i
   WHERE i.id = p_invoice_id AND i.workspace_id = p_workspace_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status = 'void' THEN
    RETURN QUERY SELECT 'void'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_inv.status = 'paid' THEN
    SELECT p.id INTO v_payment FROM core.payments p WHERE p.invoice_id = v_inv.id;
    RETURN QUERY SELECT 'already_paid'::text, v_payment;
    RETURN;
  END IF;
  IF v_inv.amount_vnd <> p_amount_vnd THEN
    RETURN QUERY SELECT 'amount_mismatch'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO core.payments (workspace_id, invoice_id, amount_vnd, bank_ref, raw_statement, confirmed_by)
  VALUES (p_workspace_id, v_inv.id, p_amount_vnd, v_ref, p_raw_statement, p_confirmed_by)
  RETURNING id INTO v_payment;
  UPDATE core.invoices SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = v_inv.id;
  RETURN QUERY SELECT 'ok'::text, v_payment;
END
$$;
--> statement-breakpoint

CREATE FUNCTION core.void_invoice(p_workspace_id uuid, p_invoice_id uuid) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;

  SELECT i.status INTO v_status FROM core.invoices i
   WHERE i.id = p_invoice_id AND i.workspace_id = p_workspace_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'pending' THEN
    RETURN v_status;
  END IF;
  UPDATE core.invoices SET status = 'void', voided_at = now(), updated_at = now() WHERE id = p_invoice_id;
  RETURN 'ok';
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION core.create_invoice(uuid, text, bigint, jsonb, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.confirm_invoice_payment(uuid, uuid, bigint, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.void_invoice(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.create_invoice(uuid, text, bigint, jsonb, text, timestamptz) FROM cf_app;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.confirm_invoice_payment(uuid, uuid, bigint, text, text, uuid) FROM cf_app;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.void_invoice(uuid, uuid) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.create_invoice(uuid, text, bigint, jsonb, text, timestamptz) TO cf_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.confirm_invoice_payment(uuid, uuid, bigint, text, text, uuid) TO cf_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.void_invoice(uuid, uuid) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

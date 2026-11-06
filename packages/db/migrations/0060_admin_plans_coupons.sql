SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "core"."coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product" text NOT NULL,
	"plan_code" text NOT NULL,
	"discount_vnd" integer NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_discount_check" CHECK ("core"."coupon_redemptions"."discount_vnd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core"."coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product" text NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"applies_plan_codes" text[],
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"max_redemptions" integer,
	"per_workspace_limit" integer DEFAULT 1 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_code_check" CHECK ("core"."coupons"."code" ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
	CONSTRAINT "coupons_product_check" CHECK ("core"."coupons"."product" in ('commentflow', 'excelflow')),
	CONSTRAINT "coupons_type_check" CHECK ("core"."coupons"."discount_type" in ('percent', 'fixed_vnd')),
	CONSTRAINT "coupons_value_check" CHECK ("core"."coupons"."discount_value" between 1 and 1000000000 and ("core"."coupons"."discount_type" <> 'percent' or "core"."coupons"."discount_value" <= 100)),
	CONSTRAINT "coupons_window_check" CHECK ("core"."coupons"."valid_until" is null or "core"."coupons"."valid_until" > "core"."coupons"."valid_from"),
	CONSTRAINT "coupons_limits_check" CHECK (("core"."coupons"."max_redemptions" is null or "core"."coupons"."max_redemptions" between 1 and 1000000) and "core"."coupons"."per_workspace_limit" between 1 and 100 and "core"."coupons"."redemption_count" >= 0),
	CONSTRAINT "coupons_note_check" CHECK (length("core"."coupons"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "core"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "core"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "core"."coupon_redemptions" USING btree ("coupon_id","workspace_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_workspace_idx" ON "core"."coupon_redemptions" USING btree ("workspace_id","redeemed_at");

--> statement-breakpoint
-- ===================================================================================================
-- ADMIN-REST phần dữ liệu (FR-104, docs/13 §3.2, docs/11 §14, Q-ADP1) — feat-admin-plans-coupons.
--  * core.coupons: dữ liệu HỆ THỐNG, RLS bật KHÔNG policy, cf_app/cf_worker/cf_auth KHÔNG có quyền nào (mã không được liệt kê
--    cho web). Đọc/ghi chỉ qua hàm DEFINER bên dưới.
--  * core.coupon_redemptions: RLS theo workspace; thành viên chỉ ĐỌC; KHÔNG ghi trực tiếp (chỉ core.apply_coupon).
--  * core.assert_billing_admin(p_write): người gọi là admin đăng nhập (app.user_id), KHÔNG ngữ cảnh workspace, KHÔNG hệ thống.
--    p_write=true → chỉ Super Admin; p_write=false → Super Admin hoặc Finance. Còn lại → 42501.
--  * core.admin_update_plan / admin_create_coupon / admin_update_coupon (Super); core.admin_list_coupons (Super + Finance).
--    Mã giảm KHÔNG đổi được mức giảm sau khi tạo (chỉ bật/tắt, hạn, trần lượt, ghi chú) để lịch sử lượt dùng còn nghĩa.
--  * core.apply_coupon(workspace, mã, sản phẩm, gói): CHỈ Owner của workspace trong ngữ cảnh withActor. Khóa dòng mã (FOR UPDATE),
--    kiểm hạn dùng + trần lượt tổng + trần lượt mỗi workspace + gói áp dụng, ghi coupon_redemptions và tăng redemption_count trong
--    CÙNG giao dịch → hai yêu cầu song song không vượt trần. Thứ tự kiểm khớp evaluateCoupon (@flow/shared). Mã không tồn tại
--    trả 'not_found' (cùng dạng với mã sai). Không thanh toán thật; chưa nối vào checkout (gap COUPON-CHECKOUT-WIRE).
--  * Giới hạn: đổi giá/hạn mức gói đổi hạn mức hiệu lực của MỌI workspace đang dùng gói đó (hạn mức đọc từ core.plans);
--    chưa có nhật ký admin (gap ADMIN-AUDIT).
--    Giới hạn ADR 005 §3: tiến trình web bị chiếm hoàn toàn tự đặt được app.user_id; hàm từ chối session_user = cf_worker. Dò mã bằng thử-sai chặn ở tầng web bằng ratelimit (gap COUPON-RATELIMIT-WIRE).
-- Đường lùi: DROP FUNCTION core.apply_coupon(uuid, text, text, text), core.admin_list_coupons(integer),
-- core.admin_update_coupon(uuid, boolean, timestamptz, integer, text),
-- core.admin_create_coupon(text, text, text, integer, text[], timestamptz, timestamptz, integer, integer, text),
-- core.admin_update_plan(text, text, text, integer, integer, integer, boolean, boolean), core.assert_billing_admin(boolean);
-- DROP TABLE core.coupon_redemptions, core.coupons; và lùi check-rls.ts. Mất lịch sử lượt dùng mã.
-- ===================================================================================================
ALTER TABLE core.coupons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON core.coupons FROM PUBLIC, cf_app, cf_worker, cf_auth;
--> statement-breakpoint
ALTER TABLE core.coupon_redemptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON core.coupon_redemptions FROM PUBLIC, cf_app, cf_worker, cf_auth;
--> statement-breakpoint
GRANT SELECT ON core.coupon_redemptions TO cf_app;
--> statement-breakpoint
CREATE POLICY coupon_redemptions_select ON core.coupon_redemptions FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_owner()))
  );
--> statement-breakpoint
CREATE FUNCTION core.assert_billing_admin(p_write boolean) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
BEGIN
  IF session_user = 'cf_worker'
     OR v_user IS NULL
     OR p_write IS NULL
     OR core.current_workspace_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR NOT EXISTS (SELECT 1 FROM core.users u
                    WHERE u.id = v_user AND u.is_admin
                      AND (u.admin_role = 'super' OR (NOT p_write AND u.admin_role = 'finance'))) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.assert_billing_admin(boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.assert_billing_admin(boolean) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.admin_update_plan(
  p_product text, p_code text, p_name text, p_price_vnd integer, p_channels_limit integer,
  p_monthly_turns integer, p_auto_reply_allowed boolean, p_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
BEGIN
  PERFORM core.assert_billing_admin(true);
  IF p_product IS NULL OR p_code IS NULL OR p_name IS NULL OR btrim(p_name) = '' OR length(p_name) > 80
     OR p_price_vnd IS NULL OR p_channels_limit IS NULL OR p_monthly_turns IS NULL
     OR p_auto_reply_allowed IS NULL OR p_active IS NULL
     OR p_price_vnd NOT BETWEEN 0 AND 1000000000
     OR p_channels_limit NOT BETWEEN 0 AND 10000
     OR p_monthly_turns NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  UPDATE core.plans p
     SET name = btrim(p_name), price_vnd = p_price_vnd, channels_limit = p_channels_limit,
         monthly_turns = p_monthly_turns, auto_reply_allowed = p_auto_reply_allowed, active = p_active
   WHERE p.product = p_product AND p.code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_not_found' USING ERRCODE = 'P0002';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.admin_update_plan(text, text, text, integer, integer, integer, boolean, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.admin_update_plan(text, text, text, integer, integer, integer, boolean, boolean) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.admin_create_coupon(
  p_code text, p_product text, p_discount_type text, p_discount_value integer, p_plan_codes text[],
  p_valid_from timestamptz, p_valid_until timestamptz, p_max_redemptions integer,
  p_per_workspace_limit integer, p_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM core.assert_billing_admin(true);
  IF p_code IS NULL OR p_product IS NULL OR p_discount_type IS NULL OR p_discount_value IS NULL
     OR p_valid_from IS NULL OR p_per_workspace_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  -- Gói áp dụng phải là gói trả phí có thật của sản phẩm (tránh mã "treo" trỏ vào gói không tồn tại).
  IF p_plan_codes IS NOT NULL AND (
       cardinality(p_plan_codes) = 0 OR EXISTS (
         SELECT 1 FROM unnest(p_plan_codes) AS pc(code)
         WHERE NOT EXISTS (SELECT 1 FROM core.plans pl
                           WHERE pl.product = p_product AND pl.code = pc.code AND pl.kind = 'base'))) THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.coupons (code, product, discount_type, discount_value, applies_plan_codes, valid_from,
                            valid_until, max_redemptions, per_workspace_limit, note, created_by)
  VALUES (upper(btrim(p_code)), p_product, p_discount_type, p_discount_value, p_plan_codes, p_valid_from,
          p_valid_until, p_max_redemptions, p_per_workspace_limit, COALESCE(p_note, ''), core.current_user_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.admin_create_coupon(text, text, text, integer, text[], timestamptz, timestamptz, integer, integer, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.admin_create_coupon(text, text, text, integer, text[], timestamptz, timestamptz, integer, integer, text) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.admin_update_coupon(
  p_id uuid, p_active boolean, p_valid_until timestamptz, p_max_redemptions integer, p_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_used integer;
BEGIN
  PERFORM core.assert_billing_admin(true);
  IF p_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  SELECT c.redemption_count INTO v_used FROM core.coupons c WHERE c.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Ngữ nghĩa "thay toàn bộ": NULL ở valid_until/max_redemptions = bỏ hạn/bỏ trần. Kiểm trước để trả 22023 đồng nhất.
  IF length(COALESCE(p_note, '')) > 200
     OR (p_valid_until IS NOT NULL
         AND p_valid_until <= (SELECT c.valid_from FROM core.coupons c WHERE c.id = p_id)) THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  -- Trần lượt không được thấp hơn số lượt đã dùng.
  IF p_max_redemptions IS NOT NULL AND p_max_redemptions < v_used THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  UPDATE core.coupons c
     SET active = p_active, valid_until = p_valid_until, max_redemptions = p_max_redemptions,
         note = COALESCE(p_note, ''), updated_at = now()
   WHERE c.id = p_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.admin_update_coupon(uuid, boolean, timestamptz, integer, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.admin_update_coupon(uuid, boolean, timestamptz, integer, text) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.admin_list_coupons(p_limit integer)
RETURNS TABLE (
  id uuid, code text, product text, discount_type text, discount_value integer, applies_plan_codes text[],
  valid_from timestamptz, valid_until timestamptz, max_redemptions integer, per_workspace_limit integer,
  redemption_count integer, active boolean, note text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
BEGIN
  PERFORM core.assert_billing_admin(false);
  RETURN QUERY
    SELECT c.id, c.code, c.product, c.discount_type, c.discount_value, c.applies_plan_codes, c.valid_from,
           c.valid_until, c.max_redemptions, c.per_workspace_limit, c.redemption_count, c.active, c.note, c.created_at
    FROM core.coupons c
    ORDER BY c.created_at DESC, c.id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.admin_list_coupons(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.admin_list_coupons(integer) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.apply_coupon(p_workspace_id uuid, p_code text, p_product text, p_plan_code text)
RETURNS TABLE (r_applied boolean, r_reason text, r_discount_vnd integer, r_final_price_vnd integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_coupon core.coupons%ROWTYPE;
  v_plan core.plans%ROWTYPE;
  v_now timestamptz := now();
  v_ws_used integer;
  v_raw bigint;
  v_discount integer;
BEGIN
  IF session_user = 'cf_worker'
     OR core.current_user_id() IS NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id
     OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR p_product IS NULL OR p_plan_code IS NULL
     OR p_product NOT IN ('commentflow', 'excelflow')
     OR p_plan_code !~ '^[a-z][a-z0-9_]{0,39}$'
     OR length(p_code) > 64 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_coupon FROM core.coupons c WHERE c.code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF NOT v_coupon.active THEN
    RETURN QUERY SELECT false, 'inactive'::text, NULL::integer, NULL::integer; RETURN;
  END IF;
  IF v_now < v_coupon.valid_from THEN
    RETURN QUERY SELECT false, 'not_started'::text, NULL::integer, NULL::integer; RETURN;
  END IF;
  IF v_coupon.valid_until IS NOT NULL AND v_now >= v_coupon.valid_until THEN
    RETURN QUERY SELECT false, 'expired'::text, NULL::integer, NULL::integer; RETURN;
  END IF;
  IF v_coupon.product <> p_product THEN
    RETURN QUERY SELECT false, 'product_mismatch'::text, NULL::integer, NULL::integer; RETURN;
  END IF;
  SELECT * INTO v_plan FROM core.plans pl WHERE pl.product = p_product AND pl.code = p_plan_code AND pl.active;
  IF NOT FOUND OR v_plan.kind <> 'base' OR v_plan.price_vnd <= 0
     OR (v_coupon.applies_plan_codes IS NOT NULL AND NOT (p_plan_code = ANY (v_coupon.applies_plan_codes))) THEN
    RETURN QUERY SELECT false, 'plan_not_eligible'::text, NULL::integer, NULL::integer; RETURN;
  END IF;
  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redemption_count >= v_coupon.max_redemptions THEN
    RETURN QUERY SELECT false, 'exhausted'::text, NULL::integer, NULL::integer; RETURN;
  END IF;
  SELECT count(*)::integer INTO v_ws_used FROM core.coupon_redemptions r
   WHERE r.coupon_id = v_coupon.id AND r.workspace_id = p_workspace_id;
  IF v_ws_used >= v_coupon.per_workspace_limit THEN
    RETURN QUERY SELECT false, 'workspace_limit_reached'::text, NULL::integer, NULL::integer; RETURN;
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_raw := (v_plan.price_vnd::bigint * v_coupon.discount_value) / 100;
  ELSE
    v_raw := v_coupon.discount_value;
  END IF;
  v_discount := LEAST(v_raw, v_plan.price_vnd)::integer;

  INSERT INTO core.coupon_redemptions (coupon_id, workspace_id, product, plan_code, discount_vnd)
  VALUES (v_coupon.id, p_workspace_id, p_product, p_plan_code, v_discount);
  UPDATE core.coupons c SET redemption_count = c.redemption_count + 1, updated_at = now() WHERE c.id = v_coupon.id;
  RETURN QUERY SELECT true, 'ok'::text, v_discount, v_plan.price_vnd - v_discount;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.apply_coupon(uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.apply_coupon(uuid, text, text, text) TO cf_app;

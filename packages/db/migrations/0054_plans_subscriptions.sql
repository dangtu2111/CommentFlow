SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "core"."plans" (
	"product" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"price_vnd" integer NOT NULL,
	"channels_limit" integer NOT NULL,
	"monthly_turns" integer NOT NULL,
	"auto_reply_allowed" boolean DEFAULT false NOT NULL,
	"trial_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_pkey" PRIMARY KEY("product","code"),
	CONSTRAINT "plans_product_check" CHECK ("core"."plans"."product" in ('commentflow', 'excelflow')),
	CONSTRAINT "plans_code_check" CHECK ("core"."plans"."code" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "plans_kind_check" CHECK ("core"."plans"."kind" in ('trial', 'base', 'addon')),
	CONSTRAINT "plans_amounts_check" CHECK ("core"."plans"."price_vnd" between 0 and 1000000000 and "core"."plans"."channels_limit" >= 0 and "core"."plans"."monthly_turns" between 0 and 1000000),
	CONSTRAINT "plans_trial_days_check" CHECK (("core"."plans"."kind" = 'trial') = ("core"."plans"."trial_days" is not null) and ("core"."plans"."trial_days" is null or "core"."plans"."trial_days" between 1 and 90))
);
--> statement-breakpoint
CREATE TABLE "core"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product" text NOT NULL,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"cancel_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_product_unique" UNIQUE("workspace_id","product"),
	CONSTRAINT "subscriptions_product_check" CHECK ("core"."subscriptions"."product" in ('commentflow', 'excelflow')),
	CONSTRAINT "subscriptions_status_check" CHECK ("core"."subscriptions"."status" in ('trialing', 'active', 'past_due', 'canceled')),
	CONSTRAINT "subscriptions_period_check" CHECK ("core"."subscriptions"."period_end" > "core"."subscriptions"."period_start")
);
--> statement-breakpoint
ALTER TABLE "core"."subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."subscriptions" ADD CONSTRAINT "subscriptions_plan_fk" FOREIGN KEY ("product","plan_code") REFERENCES "core"."plans"("product","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ===================================================================================================
-- PLANS-SCHEMA (FR-090, US-060, UF-9, docs/10 §3.6, Q-PLN1) — feat-plans-schema. Gói cước, dùng thử, mua thêm lượt.
--
--  * core.plans: bảng giá, dữ liệu HỆ THỐNG (không workspace_id, KHÔNG RLS như core.feature_flags): cf_app chỉ SELECT.
--    Seed 5 gói CommentFlow theo docs/10 (seed duy nhất được phép ngoài từ điển viết tắt; giá chủ dự án xác nhận trước khi bán).
--  * core.subscriptions: cf_app CHỈ ĐỌC (thành viên workspace hoặc ngữ cảnh hệ thống). KHÔNG có policy/GRANT ghi.
--    Ghi duy nhất qua hàm SECURITY DEFINER (mẫu core.consume_usage 0039 / core.create_invoice 0052): chỉ kết nối
--    cf_worker (session_user), ngữ cảnh job HỆ THỐNG không người dùng, workspace ngữ cảnh = p_workspace_id. EXECUTE
--    thu hồi khỏi PUBLIC và cf_app, chỉ cấp cf_worker. search_path cố định có pg_temp. Đầu vào sai → 22023.
--      - core.start_trial: tạo dùng thử (gói kind=trial còn bán, trial_days ngày); đã có subscription → 'exists', KHÔNG đổi gì
--        (dùng thử đúng một lần cho mỗi workspace+sản phẩm, idempotent).
--      - core.activate_plan: đặt gói trả phí (CHỈ kind=base còn bán), status active, kỳ [start, end]; thay cả dòng dùng thử.
--        Nơi gọi (sau khi core.confirm_invoice_payment trả 'ok') chịu trách nhiệm đúng số tiền/đúng kỳ.
--      - core.grant_usage_addon: cộng lượt mua thêm vào core.usage_counters.addon của kỳ (số lượt = monthly_turns của gói
--        kind=addon × số lượng 1–1000, KHÔNG nhận số lượt tự do). Mỗi lần gọi cộng một lần: nơi gọi phải gọi đúng một lần
--        cho mỗi hóa đơn đã thanh toán (cùng giao dịch withJob với xác nhận thanh toán). Tổng addon tối đa 1.000.000.000.
--  * Hạn mức lượt hiệu lực của kỳ KHÔNG lưu ở đây: tính bằng resolvePlanState (@flow/shared) rồi truyền vào
--    core.consume_usage như trước; hết dùng thử/hết kỳ → hạn mức 0 (fail-closed).
--
-- TRIỂN KHAI: migrate trước; chưa có nơi gọi trong runtime (web/worker) nên không cần phối hợp bản chạy.
-- Đường lùi: DROP FUNCTION core.grant_usage_addon(uuid, text, text, date, text, integer),
-- core.activate_plan(uuid, text, text, timestamptz, timestamptz), core.start_trial(uuid, text);
-- DROP TABLE core.subscriptions, core.plans; và lùi check-rls.ts. Mất dữ liệu gói đã gán (lượt mua thêm đã cộng
-- vào usage_counters.addon vẫn còn).
-- ===================================================================================================

INSERT INTO core.plans (product, code, name, kind, price_vnd, channels_limit, monthly_turns, auto_reply_allowed, trial_days)
VALUES
  ('commentflow', 'trial',       'Dùng thử',            'trial',     0, 1,  300, false, 14),
  ('commentflow', 'starter',     'Starter',             'base',  299000, 1, 1000, false, NULL),
  ('commentflow', 'growth',      'Growth',              'base',  699000, 3, 3000, true,  NULL),
  ('commentflow', 'business',    'Business',            'base', 1490000, 10, 7500, true, NULL),
  ('commentflow', 'addon_1000',  'Mua thêm 1.000 lượt', 'addon', 149000, 0, 1000, false, NULL);
--> statement-breakpoint

ALTER TABLE core.subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON core.plans TO cf_app;
--> statement-breakpoint
GRANT SELECT ON core.subscriptions TO cf_app;
--> statement-breakpoint
CREATE POLICY subscriptions_select ON core.subscriptions FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint

CREATE FUNCTION core.start_trial(p_workspace_id uuid, p_product text) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_plan core.plans%ROWTYPE;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('commentflow', 'excelflow') THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_plan FROM core.plans WHERE product = p_product AND kind = 'trial' AND active ORDER BY code LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.subscriptions (workspace_id, product, plan_code, status, period_start, period_end)
  VALUES (p_workspace_id, p_product, v_plan.code, 'trialing', now(), now() + make_interval(days => v_plan.trial_days))
  ON CONFLICT (workspace_id, product) DO NOTHING;
  IF FOUND THEN
    RETURN 'ok';
  END IF;
  RETURN 'exists';
END
$$;
--> statement-breakpoint

CREATE FUNCTION core.activate_plan(
  p_workspace_id uuid, p_product text, p_plan_code text, p_period_start timestamptz, p_period_end timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('commentflow', 'excelflow')
     OR p_plan_code IS NULL
     OR p_period_start IS NULL OR p_period_end IS NULL
     OR p_period_end <= p_period_start
     OR p_period_end > p_period_start + interval '400 days'
     OR NOT EXISTS (SELECT 1 FROM core.plans WHERE product = p_product AND code = p_plan_code AND kind = 'base' AND active) THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.subscriptions AS s (workspace_id, product, plan_code, status, period_start, period_end)
  VALUES (p_workspace_id, p_product, p_plan_code, 'active', p_period_start, p_period_end)
  ON CONFLICT (workspace_id, product)
  DO UPDATE SET plan_code = EXCLUDED.plan_code, status = 'active', period_start = EXCLUDED.period_start,
                period_end = EXCLUDED.period_end, cancel_at = NULL, updated_at = now();
END
$$;
--> statement-breakpoint

CREATE FUNCTION core.grant_usage_addon(
  p_workspace_id uuid, p_product text, p_meter text, p_period_start date, p_addon_code text, p_quantity integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_turns integer;
  v_current integer;
  v_total bigint;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('commentflow', 'excelflow')
     OR p_meter IS NULL OR p_meter !~ '^[a-z][a-z0-9_]{0,39}$'
     OR p_period_start IS NULL OR extract(day FROM p_period_start) <> 1
     OR p_addon_code IS NULL
     OR p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  SELECT monthly_turns INTO v_turns FROM core.plans
   WHERE product = p_product AND code = p_addon_code AND kind = 'addon' AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;

  -- Tạo dòng kỳ nếu chưa có (hạn mức 0: consume_usage đặt lại theo gói mỗi lần gọi); khóa dòng rồi cộng.
  INSERT INTO core.usage_counters AS u (workspace_id, product, meter, period_start, limit_amount)
  VALUES (p_workspace_id, p_product, p_meter, p_period_start, 0)
  ON CONFLICT (workspace_id, product, meter, period_start) DO UPDATE SET updated_at = now()
  RETURNING u.addon INTO v_current;

  v_total := v_current::bigint + v_turns::bigint * p_quantity;
  IF v_total > 1000000000 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  UPDATE core.usage_counters u
     SET addon = v_total::integer, updated_at = now()
   WHERE u.workspace_id = p_workspace_id AND u.product = p_product
     AND u.meter = p_meter AND u.period_start = p_period_start;
  RETURN v_total::integer;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION core.start_trial(uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.start_trial(uuid, text) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.start_trial(uuid, text) TO cf_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.activate_plan(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.activate_plan(uuid, text, text, timestamptz, timestamptz) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.activate_plan(uuid, text, text, timestamptz, timestamptz) TO cf_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.grant_usage_addon(uuid, text, text, date, text, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.grant_usage_addon(uuid, text, text, date, text, integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.grant_usage_addon(uuid, text, text, date, text, integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

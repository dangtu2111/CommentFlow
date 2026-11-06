SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "core"."usage_counters" (
	"workspace_id" uuid NOT NULL,
	"product" text NOT NULL,
	"meter" text NOT NULL,
	"period_start" date NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"limit_amount" integer DEFAULT 0 NOT NULL,
	"addon" integer DEFAULT 0 NOT NULL,
	"warned_80_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_pkey" PRIMARY KEY("workspace_id","product","meter","period_start"),
	CONSTRAINT "usage_counters_product_check" CHECK ("core"."usage_counters"."product" in ('commentflow', 'excelflow')),
	CONSTRAINT "usage_counters_meter_check" CHECK ("core"."usage_counters"."meter" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "usage_counters_amounts_check" CHECK ("core"."usage_counters"."used" >= 0 and "core"."usage_counters"."limit_amount" >= 0 and "core"."usage_counters"."addon" >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- ===================================================================================================
-- USAGE-COUNTERS (FR-090, BR-03/BR-06, Q-UC1) — feat-usage-counters. Bộ đếm lượt AI theo kỳ + chặn ở 100%.
--
--  * Bảng core.usage_counters: PK (workspace_id, product, meter, period_start); `limit_amount` thay cột `limit`
--    của docs/10 (từ khóa SQL). cf_app CHỈ ĐỌC (GRANT SELECT): thành viên đang hoạt động của đúng workspace, hoặc ngữ
--    cảnh workspace không người dùng (withWorkspace/withJob). KHÔNG có policy/GRANT INSERT/UPDATE/DELETE.
--  * Ghi duy nhất qua core.consume_usage(...) SECURITY DEFINER (chủ bảng bỏ qua RLS), nguyên tử: UPSERT dòng kỳ (khóa dòng,
--    tuần tự hóa các worker đua nhau) → còn đủ hạn mức (limit_amount + addon) thì trừ, ngược lại KHÔNG trừ và ghi
--    blocked_at (lần đầu). warned_80_at ghi một lần khi used*100 >= 80*(limit+addon) lần đầu → warned_now.
--  * Quyền gọi (mẫu cf.list_stuck_outbox/read_channel_token, 0030/0031): chỉ kết nối cf_worker (session_user), ngữ cảnh job
--    HỆ THỐNG, không có người dùng, và workspace ngữ cảnh = p_workspace_id (job B không trừ lượt của A). EXECUTE thu hồi
--    khỏi PUBLIC và cf_app, chỉ cấp cf_worker. search_path cố định có pg_temp. Đầu vào sai → 22023.
--  * Hạn mức (p_limit) do nơi gọi truyền MỖI lần (gói cước thật ở PLANS-SCHEMA): nâng gói có hiệu lực ngay. Cột addon
--    (mua thêm) chưa có đường ghi — việc mua thêm (TRIAL-UPGRADE-UI/QR-PAYMENT) thêm hàm DEFINER riêng.
--
--  * GIỚI HẠN ĐÃ BIẾT (verifier, ghi ở Q-UC1): `p_limit`/`p_period_start` do nơi gọi truyền nên chặn 100% chỉ đúng khi nơi
--    gọi trung thực (kỳ phải là ngày 1); PLANS-SCHEMA sẽ đưa hạn mức vào DB. Hàm khóa dòng tới COMMIT: gọi trong một
--    `withJob` NGẮN riêng trước khi gọi LLM, trả `allowed=false` thì `return` (không ném, để `blocked_at` được lưu).
--
-- TRIỂN KHAI: migrate trước; chưa có nơi gọi trong worker (chờ nối pipeline AI), nên không cần phối hợp bản worker.
-- Đường lùi: DROP FUNCTION core.consume_usage(uuid, text, text, integer, date, integer); DROP TABLE core.usage_counters;
-- và lùi check-rls.ts (hàm cho phép của cf_worker, NO_DELETE, cột cấm GHI, checkUsageFunction). Mất số đếm của kỳ hiện tại.
-- ===================================================================================================

ALTER TABLE core.usage_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON core.usage_counters TO cf_app;
--> statement-breakpoint
CREATE POLICY usage_counters_select ON core.usage_counters FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint

CREATE FUNCTION core.consume_usage(
  p_workspace_id uuid, p_product text, p_meter text, p_amount integer, p_period_start date, p_limit integer
) RETURNS TABLE (
  allowed boolean, used_after integer, limit_now integer, addon_now integer, warned_now boolean, blocked_now boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_row core.usage_counters%ROWTYPE;
  v_capacity bigint;
  v_new_used integer;
  v_warn boolean := false;
  v_block boolean := false;
BEGIN
  -- Chỉ đường job HỆ THỐNG của đúng workspace trên kết nối cf_worker (fail-closed với NULL).
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('commentflow', 'excelflow')
     OR p_meter IS NULL OR p_meter !~ '^[a-z][a-z0-9_]{0,39}$'
     OR p_amount IS NULL OR p_amount < 1 OR p_amount > 1000
     OR p_period_start IS NULL OR extract(day FROM p_period_start) <> 1
     OR p_limit IS NULL OR p_limit < 0 OR p_limit > 1000000000 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;

  -- Tạo dòng kỳ nếu chưa có, cập nhật hạn mức theo nơi gọi; ON CONFLICT DO UPDATE khóa dòng nên các lệnh đua nhau
  -- chạy tuần tự và mỗi lệnh thấy bản mới nhất đã commit.
  INSERT INTO core.usage_counters AS u (workspace_id, product, meter, period_start, limit_amount)
  VALUES (p_workspace_id, p_product, p_meter, p_period_start, p_limit)
  ON CONFLICT (workspace_id, product, meter, period_start)
  DO UPDATE SET limit_amount = EXCLUDED.limit_amount, updated_at = now()
  RETURNING u.* INTO v_row;

  v_capacity := v_row.limit_amount::bigint + v_row.addon::bigint;

  IF v_row.used::bigint + p_amount <= v_capacity THEN
    v_new_used := v_row.used + p_amount;
    v_warn := v_row.warned_80_at IS NULL AND v_new_used::bigint * 100 >= 80 * v_capacity;
    UPDATE core.usage_counters u
       SET used = v_new_used,
           warned_80_at = CASE WHEN v_warn THEN now() ELSE u.warned_80_at END,
           updated_at = now()
     WHERE u.workspace_id = p_workspace_id AND u.product = p_product
       AND u.meter = p_meter AND u.period_start = p_period_start;
    RETURN QUERY SELECT true, v_new_used, v_row.limit_amount, v_row.addon, v_warn, false;
  ELSE
    v_block := v_row.blocked_at IS NULL;
    IF v_block THEN
      UPDATE core.usage_counters u
         SET blocked_at = now(), updated_at = now()
       WHERE u.workspace_id = p_workspace_id AND u.product = p_product
         AND u.meter = p_meter AND u.period_start = p_period_start;
    END IF;
    RETURN QUERY SELECT false, v_row.used, v_row.limit_amount, v_row.addon, false, v_block;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.consume_usage(uuid, text, text, integer, date, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.consume_usage(uuid, text, text, integer, date, integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.consume_usage(uuid, text, text, integer, date, integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

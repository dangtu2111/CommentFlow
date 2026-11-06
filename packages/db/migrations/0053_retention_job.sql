SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."ai_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"step" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text DEFAULT '' NOT NULL,
	"cache_hit" boolean NOT NULL,
	"calls" integer NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"cached_tokens" bigint NOT NULL,
	"cost_usd" numeric(14, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cf"."ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_daily_key_unique" ON "cf"."ai_usage_daily" USING btree ("workspace_id","day","step","model","prompt_version","cache_hit");--> statement-breakpoint

-- ===================================================================================================
-- RETENTION-JOB (FR-126, Q-RET1): thời hạn lưu dữ liệu 12 tháng + gộp ai_usage theo ngày sau 90 ngày.
--  * cf.ai_usage_daily: bản gộp; cf_app CHỈ ĐỌC (SELECT, không INSERT/UPDATE/DELETE); ghi chỉ qua hàm DEFINER
--    cf.compact_ai_usage. Một policy SELECT: thành viên hoặc "không người dùng" như ai_usage (0001).
--  * cf.compact_ai_usage(p_days): chỉ NGỮ CẢNH TRẦN + kết nối cf_worker (mẫu cf.purge_expired_retrieval_logs, 0040);
--    cận dưới 30 ngày (CF422: không gộp dữ liệu còn dùng cho cổng chi phí tháng); MỘT câu lệnh (xóa + cộng dồn) nên
--    nguyên tử: tổng token/chi phí/số lần gọi bảo toàn; tối đa 20000 dòng/lần; idempotent.
--  * cf.purge_expired_workspace_data(p_days): xóa bình luận (kéo theo comment_replies/comment_hides qua FK cascade),
--    nháp AI (drafts) theo created_at và khách tiềm năng theo updated_at quá p_days; cận dưới 180 ngày (CF422);
--    tối đa 5000 dòng/loại/lần. KHÔNG xóa core.action_logs (nhật ký kiểm toán), core.invoices/payments, ai_usage_daily.
--    Bảng tin nhắn chưa tồn tại (gap RETENTION-MESSAGES khi có MESSAGES-*).
-- Đường lùi: DROP FUNCTION cf.purge_expired_workspace_data(integer); DROP FUNCTION cf.compact_ai_usage(integer);
-- DROP TABLE cf.ai_usage_daily; lùi check-rls.ts + job retention. Dữ liệu đã xóa/gộp KHÔNG phục hồi (có chủ đích).
-- ===================================================================================================
ALTER TABLE cf.ai_usage_daily ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.ai_usage_daily TO cf_app;
--> statement-breakpoint
CREATE POLICY ai_usage_daily_select ON cf.ai_usage_daily FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint

CREATE FUNCTION cf.compact_ai_usage(p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_compacted integer;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 30 THEN
    RAISE EXCEPTION 'invalid_days' USING ERRCODE = 'CF422';
  END IF;

  WITH moved AS (
    DELETE FROM cf.ai_usage
     WHERE id IN (SELECT id FROM cf.ai_usage
                   WHERE created_at < now() - make_interval(days => p_days)
                   ORDER BY created_at LIMIT 20000)
    RETURNING workspace_id, created_at, step, model, prompt_version, cache_hit,
              input_tokens, output_tokens, cached_tokens, cost_usd
  ), grouped AS (
    SELECT workspace_id,
           (created_at AT TIME ZONE 'UTC')::date AS day,
           step, model, coalesce(prompt_version, '') AS prompt_version, cache_hit,
           count(*)::integer AS calls,
           sum(input_tokens)::bigint AS input_tokens,
           sum(output_tokens)::bigint AS output_tokens,
           sum(cached_tokens)::bigint AS cached_tokens,
           sum(cost_usd) AS cost_usd
      FROM moved
     GROUP BY 1, 2, 3, 4, 5, 6
  ), up AS (
    INSERT INTO cf.ai_usage_daily AS d
      (workspace_id, day, step, model, prompt_version, cache_hit, calls,
       input_tokens, output_tokens, cached_tokens, cost_usd)
    SELECT workspace_id, day, step, model, prompt_version, cache_hit, calls,
           input_tokens, output_tokens, cached_tokens, cost_usd
      FROM grouped
    ON CONFLICT (workspace_id, day, step, model, prompt_version, cache_hit) DO UPDATE
      SET calls = d.calls + EXCLUDED.calls,
          input_tokens = d.input_tokens + EXCLUDED.input_tokens,
          output_tokens = d.output_tokens + EXCLUDED.output_tokens,
          cached_tokens = d.cached_tokens + EXCLUDED.cached_tokens,
          cost_usd = d.cost_usd + EXCLUDED.cost_usd
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_compacted FROM moved;
  RETURN v_compacted;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.compact_ai_usage(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.compact_ai_usage(integer) TO cf_worker;
--> statement-breakpoint

CREATE FUNCTION cf.purge_expired_workspace_data(p_days integer)
RETURNS TABLE (purged_comments integer, purged_drafts integer, purged_leads integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_comments integer;
  v_drafts integer;
  v_leads integer;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 180 THEN
    RAISE EXCEPTION 'invalid_days' USING ERRCODE = 'CF422';
  END IF;

  DELETE FROM cf.comments
   WHERE id IN (SELECT id FROM cf.comments
                 WHERE created_at < now() - make_interval(days => p_days)
                 ORDER BY created_at LIMIT 5000);
  GET DIAGNOSTICS v_comments = ROW_COUNT;

  DELETE FROM cf.drafts
   WHERE id IN (SELECT id FROM cf.drafts
                 WHERE created_at < now() - make_interval(days => p_days)
                 ORDER BY created_at LIMIT 5000);
  GET DIAGNOSTICS v_drafts = ROW_COUNT;

  DELETE FROM cf.leads
   WHERE id IN (SELECT id FROM cf.leads
                 WHERE updated_at < now() - make_interval(days => p_days)
                 ORDER BY updated_at LIMIT 5000);
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  RETURN QUERY SELECT v_comments, v_drafts, v_leads;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.purge_expired_workspace_data(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.purge_expired_workspace_data(integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

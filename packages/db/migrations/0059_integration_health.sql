CREATE TABLE "cf"."integration_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_incidents_provider_check" CHECK ("cf"."integration_incidents"."provider" in ('facebook','instagram','tiktok','shopify','google_sheets','haravan','sapo','kiotviet','pancake','llm','smtp')),
	CONSTRAINT "integration_incidents_kind_check" CHECK ("cf"."integration_incidents"."kind" in ('webhook','api','token','sync','queue')),
	CONSTRAINT "integration_incidents_code_check" CHECK (length("cf"."integration_incidents"."code") between 1 and 64),
	CONSTRAINT "integration_incidents_message_check" CHECK (length("cf"."integration_incidents"."message") <= 300)
);
--> statement-breakpoint
ALTER TABLE "cf"."integration_incidents" ADD CONSTRAINT "integration_incidents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_incidents_time_idx" ON "cf"."integration_incidents" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "integration_incidents_workspace_idx" ON "cf"."integration_incidents" USING btree ("workspace_id","provider","occurred_at");--> statement-breakpoint
-- ===================================================================================================
-- ADMIN-INTEGRATION-HEALTH (FR-104, US-083, Q-AIH1) — feat-integration-health.
--  * cf.integration_incidents: vòng ghi lỗi tích hợp. INSERT CHỈ hệ thống (worker, cf_worker); SELECT thành viên
--    workspace (hoặc không người dùng). KHÔNG UPDATE/DELETE bằng cf_app (nhật ký bất biến; dọn bằng job chủ sở hữu sau).
--  * Admin xem TỔNG HỢP xuyên workspace QUA hai hàm DEFINER, chỉ Super Admin (docs/13 §3.2): cf.admin_integration_health,
--    cf.admin_dead_letters. Người gọi phải là user is_admin + admin_role = 'super' (lấy từ app.user_id do withUser đặt);
--    mọi trường hợp khác (không user, Owner, support, finance, ngữ cảnh hệ thống) → 42501. Không trả payload/PII.
--    Giới hạn (ADR 005 §3): tiến trình web bị chiếm hoàn toàn tự đặt được app.user_id — chấp nhận như phần còn lại.
--  * Số liệu hàng đợi pg-boss (độ trễ, số job lỗi) đọc ở worker bằng API pg-boss, KHÔNG qua DB hàm này (gap
--    INTEGRATION-HEALTH-QUEUE-WIRE).
-- Đường lùi: DROP FUNCTION cf.admin_dead_letters(integer), cf.admin_integration_health(timestamptz),
-- cf.assert_super_admin(); DROP TABLE cf.integration_incidents; bỏ kỳ vọng ở check-rls.ts.
-- ===================================================================================================
ALTER TABLE cf.integration_incidents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.integration_incidents TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, provider, kind, code, message, occurred_at)
  ON cf.integration_incidents TO cf_app;
--> statement-breakpoint
CREATE POLICY integration_incidents_select ON cf.integration_incidents FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY integration_incidents_insert ON cf.integration_incidents FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE FUNCTION cf.assert_super_admin() RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
BEGIN
  IF v_user IS NULL
     OR core.current_workspace_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR NOT EXISTS (SELECT 1 FROM core.users u
                    WHERE u.id = v_user AND u.is_admin AND u.admin_role = 'super') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.assert_super_admin() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.assert_super_admin() TO cf_app;
--> statement-breakpoint
CREATE FUNCTION cf.admin_integration_health(p_since timestamptz)
RETURNS TABLE (provider text, kind text, error_count bigint, workspace_count bigint, last_occurred_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  PERFORM cf.assert_super_admin();
  RETURN QUERY
    SELECT i.provider, i.kind, count(*)::bigint, count(DISTINCT i.workspace_id)::bigint, max(i.occurred_at)
    FROM cf.integration_incidents i
    WHERE i.occurred_at >= p_since
    GROUP BY i.provider, i.kind
    ORDER BY i.provider, i.kind;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.admin_integration_health(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.admin_integration_health(timestamptz) TO cf_app;
--> statement-breakpoint
-- Dead letter = webhook_events.status = 'dead'. KHÔNG trả payload (chứa tên khách); error cắt 2000 ký tự rồi che PII + cắt 300 ở tầng TS (cắt SAU khi che).
CREATE FUNCTION cf.admin_dead_letters(p_limit integer)
RETURNS TABLE (id uuid, workspace_id uuid, platform text, attempts integer, error text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  PERFORM cf.assert_super_admin();
  RETURN QUERY
    SELECT w.id, w.workspace_id, w.platform, w.attempts, left(w.error, 2000), w.created_at
    FROM cf.webhook_events w
    WHERE w.status = 'dead'
    ORDER BY w.created_at DESC, w.id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.admin_dead_letters(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.admin_dead_letters(integer) TO cf_app;

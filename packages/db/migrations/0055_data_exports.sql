SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "core"."data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_key" text,
	"size_bytes" bigint,
	"row_counts" jsonb,
	"error_code" text,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_exports_status_check" CHECK ("core"."data_exports"."status" in ('pending', 'running', 'ready', 'failed', 'expired')),
	CONSTRAINT "data_exports_ready_check" CHECK (("core"."data_exports"."status" in ('ready', 'expired')) = ("core"."data_exports"."ready_at" is not null)),
	CONSTRAINT "data_exports_size_check" CHECK ("core"."data_exports"."size_bytes" is null or "core"."data_exports"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."data_exports" ADD CONSTRAINT "data_exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."data_exports" ADD CONSTRAINT "data_exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_exports_active_unique" ON "core"."data_exports" USING btree ("workspace_id") WHERE "core"."data_exports"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "data_exports_workspace_created_idx" ON "core"."data_exports" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "data_exports_expiry_idx" ON "core"."data_exports" USING btree ("expires_at") WHERE "core"."data_exports"."status" = 'ready';--> statement-breakpoint

-- ===================================================================================================
-- DATA-EXPORT (FR-094, Q-EXP1): yêu cầu xuất dữ liệu workspace.
--  * RLS bật. cf_app: SELECT (Owner của workspace hoặc đường hệ thống), INSERT chỉ hai cột workspace_id/requested_by
--    (Owner, requested_by = người dùng hiện tại; status mặc định 'pending'), UPDATE chỉ đường hệ thống (worker withJob).
--    KHÔNG có DELETE cho cf_app (lịch sử yêu cầu giữ lại; tệp hết hạn thì status = 'expired').
--  * Tối đa một yêu cầu pending/running mỗi workspace (chỉ mục duy nhất một phần). Giới hạn 5 yêu cầu/24 giờ do tầng truy vấn.
--  * Job dọn ở ngữ cảnh trần (hết hạn/kẹt) đi qua hai hàm DEFINER chỉ cf_worker (cf.expire_data_exports, cf.fail_stale_data_exports),
--    cùng mẫu retention 0053: withSystem đặt app.ctx rỗng nên policy không dựa vào is_system_context() ở ngữ cảnh trần được.
--  * Chưa có nơi gọi trong runtime trước nhánh này nên không cần phối hợp bản chạy.
-- Đường lùi: DROP TABLE core.data_exports (+ lùi check-rls.ts). Mất lịch sử yêu cầu; tệp trong kho tự hết hạn.
-- ===================================================================================================
ALTER TABLE core.data_exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON core.data_exports TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status, file_key, size_bytes, row_counts, error_code, ready_at, expires_at, updated_at) ON core.data_exports TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, requested_by) ON core.data_exports TO cf_app;
--> statement-breakpoint
CREATE POLICY data_exports_select ON core.data_exports FOR SELECT
  USING (
    (workspace_id = (SELECT core.current_workspace_id())
      AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_owner())))
  );
--> statement-breakpoint
CREATE POLICY data_exports_insert ON core.data_exports FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_owner())
    AND requested_by = (SELECT core.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY data_exports_update ON core.data_exports FOR UPDATE
  USING (
    (SELECT core.is_system_context())
    AND workspace_id = (SELECT core.current_workspace_id())
  )
  WITH CHECK (
    (SELECT core.is_system_context())
    AND workspace_id = (SELECT core.current_workspace_id())
  );
--> statement-breakpoint

CREATE FUNCTION cf.fail_stale_data_exports(p_minutes integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE core.data_exports SET status = 'failed', error_code = 'timeout', updated_at = now()
   WHERE status IN ('pending', 'running')
     AND updated_at < now() - make_interval(mins => p_minutes);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION cf.expire_data_exports(p_limit integer)
RETURNS TABLE (id uuid, workspace_id uuid, file_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF session_user <> 'cf_worker'
     OR core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  UPDATE core.data_exports d SET status = 'expired', updated_at = now()
   WHERE d.id IN (SELECT x.id FROM core.data_exports x WHERE x.status = 'ready' AND x.expires_at <= now()
                   ORDER BY x.expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING d.id, d.workspace_id, d.file_key;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.fail_stale_data_exports(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.expire_data_exports(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.fail_stale_data_exports(integer) TO cf_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.expire_data_exports(integer) TO cf_worker;
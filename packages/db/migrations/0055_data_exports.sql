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
--  * Không có hàm DEFINER; chưa có nơi gọi trong runtime trước nhánh này nên không cần phối hợp bản chạy.
-- Đường lùi: DROP TABLE core.data_exports (+ lùi check-rls.ts). Mất lịch sử yêu cầu; tệp trong kho tự hết hạn.
-- ===================================================================================================
ALTER TABLE core.data_exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, UPDATE ON core.data_exports TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, requested_by) ON core.data_exports TO cf_app;
--> statement-breakpoint
CREATE POLICY data_exports_select ON core.data_exports FOR SELECT
  USING (
    (workspace_id = (SELECT core.current_workspace_id())
      AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_owner())))
    -- Job dọn (hết hạn/kẹt) chạy ở ngữ cảnh hệ thống TRẦN (không workspace) trên kết nối cf_worker.
    OR ((SELECT core.current_workspace_id()) IS NULL AND (SELECT core.is_system_context()))
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
    AND (workspace_id = (SELECT core.current_workspace_id()) OR (SELECT core.current_workspace_id()) IS NULL)
  )
  WITH CHECK (
    (SELECT core.is_system_context())
    AND (workspace_id = (SELECT core.current_workspace_id()) OR (SELECT core.current_workspace_id()) IS NULL)
  );
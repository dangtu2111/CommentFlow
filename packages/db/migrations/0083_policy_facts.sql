SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."policy_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"slot" text NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"evidence" text,
	"source_ref" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rev" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_facts_workspace_kind_slot_status_unique" UNIQUE("workspace_id","kind","slot","status"),
	CONSTRAINT "policy_facts_kind_check" CHECK ("cf"."policy_facts"."kind" IN ('ship_region', 'cod', 'returns', 'warranty', 'payment')),
	CONSTRAINT "policy_facts_status_check" CHECK ("cf"."policy_facts"."status" IN ('draft', 'approved')),
	CONSTRAINT "policy_facts_origin_check" CHECK ("cf"."policy_facts"."origin" IN ('manual', 'shopify_suggested', 'text_suggested')),
	CONSTRAINT "policy_facts_slot_check" CHECK (char_length("cf"."policy_facts"."slot") between 1 and 100),
	CONSTRAINT "policy_facts_data_check" CHECK (jsonb_typeof("cf"."policy_facts"."data") = 'object'),
	CONSTRAINT "policy_facts_evidence_check" CHECK (("cf"."policy_facts"."evidence" IS NULL OR char_length("cf"."policy_facts"."evidence") between 1 and 2000) AND ("cf"."policy_facts"."origin" = 'manual' OR "cf"."policy_facts"."evidence" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "cf"."policy_facts" ADD CONSTRAINT "policy_facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."policy_facts" ADD CONSTRAINT "policy_facts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."policy_facts" ADD CONSTRAINT "policy_facts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_facts_workspace_status_idx" ON "cf"."policy_facts" USING btree ("workspace_id","status","kind");
--> statement-breakpoint
-- ===================================================================================================
-- DRAFT-FACT-SLOTS (ADR 017, PR 2) — policy_facts: chính sách CÓ CẤU TRÚC (ship theo khu vực, COD, đổi trả, bảo hành, thanh toán).
--
--  * RLS: SELECT cho thành viên đang hoạt động (hoặc ngữ cảnh không người dùng: withWorkspace/withJob).
--    INSERT: Owner (ghi tay hoặc duyệt luôn) HOẶC hệ thống — hệ thống CHỈ ghi ĐỀ XUẤT: status='draft' và origin ≠ 'manual' (có evidence, CHECK).
--    UPDATE/DELETE: Owner, hoặc hệ thống chỉ trên bản NHÁP (làm mới đề xuất mỗi lần đồng bộ). Staff không ghi. withWorkspace trần (không người dùng) không ghi.
--  * Trigger policy_facts_guard (SECURITY INVOKER): chỉ Owner đặt/giữ status='approved' (lỗi 42501 nếu khác); đóng dấu approved_by/approved_at do SERVER (không tin client);
--    bản nháp không mang dấu duyệt; workspace_id/kind/slot/origin bất biến; mỗi UPDATE tăng rev và updated_at.
--  * created_by chỉ được trống hoặc là chính người đang ghi. cf_app KHÔNG được ghi trực tiếp approved_by/approved_at/rev (không có trong GRANT).
--  * Giá trị status='draft' KHÔNG bao giờ được đọc vào fact plan (truy vấn nạp chỉ lấy 'approved').
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng trong production (cờ factSlots TẮT) nên không cần phối hợp worker/web.
-- Đường lùi: DROP TRIGGER policy_facts_guard ON cf.policy_facts; DROP FUNCTION cf.policy_facts_guard(); DROP TABLE cf.policy_facts;
--            (và bỏ kỳ vọng cf.policy_facts ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.policy_facts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.policy_facts TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, kind, slot, data, status, origin, evidence, source_ref, created_by) ON cf.policy_facts TO cf_app;
--> statement-breakpoint
GRANT UPDATE (data, status, evidence, source_ref) ON cf.policy_facts TO cf_app;
--> statement-breakpoint
CREATE POLICY policy_facts_select ON cf.policy_facts FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY policy_facts_insert ON cf.policy_facts FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_workspace_owner())
      OR ((SELECT core.is_system_context()) AND status = 'draft' AND origin <> 'manual')
    )
    AND (num_nulls(created_by) = 1 OR created_by = (SELECT core.current_user_id()))
  );
--> statement-breakpoint
CREATE POLICY policy_facts_update ON cf.policy_facts FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR ((SELECT core.is_system_context()) AND status = 'draft'))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR ((SELECT core.is_system_context()) AND status = 'draft'))
  );
--> statement-breakpoint
CREATE POLICY policy_facts_delete ON cf.policy_facts FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR ((SELECT core.is_system_context()) AND status = 'draft'))
  );
--> statement-breakpoint
CREATE FUNCTION cf.policy_facts_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id <> OLD.workspace_id OR NEW.kind <> OLD.kind OR NEW.slot <> OLD.slot OR NEW.origin <> OLD.origin THEN
      RAISE EXCEPTION 'policy_facts: không được đổi workspace/kind/slot/origin' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'approved' THEN
    IF core.current_user_id() IS NULL OR NOT core.is_workspace_owner() THEN
      RAISE EXCEPTION 'policy_facts: chỉ Owner được duyệt chính sách' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' OR OLD.status <> 'approved' OR NEW.data IS DISTINCT FROM OLD.data THEN
      NEW.approved_by := core.current_user_id();
      NEW.approved_at := now();
    ELSE
      NEW.approved_by := OLD.approved_by;
      NEW.approved_at := OLD.approved_at;
    END IF;
  ELSE
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.rev := OLD.rev + 1;
    NEW.updated_at := now();
  ELSE
    NEW.rev := 1;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER policy_facts_guard BEFORE INSERT OR UPDATE ON cf.policy_facts
  FOR EACH ROW EXECUTE FUNCTION cf.policy_facts_guard();
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

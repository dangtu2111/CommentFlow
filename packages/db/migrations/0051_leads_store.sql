SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"name" text,
	"phone_enc" "bytea",
	"phone_hash" "bytea",
	"phone_last4" text,
	"email_enc" "bytea",
	"email_hash" "bytea",
	"key_version" integer NOT NULL,
	"note" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_source_type_check" CHECK ("cf"."leads"."source_type" IN ('comment', 'message')),
	CONSTRAINT "leads_stage_check" CHECK ("cf"."leads"."stage" IN ('new', 'contacted', 'won', 'lost')),
	CONSTRAINT "leads_name_len_check" CHECK (char_length("cf"."leads"."name") <= 120),
	CONSTRAINT "leads_note_len_check" CHECK (char_length("cf"."leads"."note") <= 500),
	CONSTRAINT "leads_last4_check" CHECK ("cf"."leads"."phone_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "leads_contact_shape_check" CHECK (("cf"."leads"."phone_enc" IS NOT NULL AND "cf"."leads"."phone_hash" IS NOT NULL AND "cf"."leads"."phone_last4" IS NOT NULL
        OR "cf"."leads"."phone_enc" IS NULL AND "cf"."leads"."phone_hash" IS NULL AND "cf"."leads"."phone_last4" IS NULL)
        AND ("cf"."leads"."email_enc" IS NOT NULL AND "cf"."leads"."email_hash" IS NOT NULL
        OR "cf"."leads"."email_enc" IS NULL AND "cf"."leads"."email_hash" IS NULL)
        AND ("cf"."leads"."phone_enc" IS NOT NULL OR "cf"."leads"."email_enc" IS NOT NULL)),
	CONSTRAINT "leads_hash_len_check" CHECK (octet_length("cf"."leads"."phone_hash") = 32 AND octet_length("cf"."leads"."email_hash") = 32)
);
--> statement-breakpoint
ALTER TABLE "cf"."leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."leads" ADD CONSTRAINT "leads_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_phone_hash_unique" ON "cf"."leads" USING btree ("workspace_id","phone_hash") WHERE "cf"."leads"."phone_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_email_hash_unique" ON "cf"."leads" USING btree ("workspace_id","email_hash") WHERE "cf"."leads"."email_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_workspace_stage_idx" ON "cf"."leads" USING btree ("workspace_id","stage","created_at");
--> statement-breakpoint
-- ===================================================================================================
-- LEADS-STORE (FR-082/033/162, docs/10 §3.5 `leads`, Q-LDS1) — feat-leads-store.
-- Khách tiềm năng theo workspace. SĐT/email KHÔNG thô: *_enc (AES-256-GCM, tầng ứng dụng), *_hash (HMAC theo workspace).
--
--  * INSERT: CHỈ hệ thống (ContactSink qua withJob/cf_worker). Owner/Staff/withWorkspace trần không chèn được.
--    GRANT INSERT không có name/note/stage/assigned_to (mặc định stage='new').
--  * UPDATE: thành viên đang hoạt động hoặc hệ thống, GRANT chỉ (name, note, stage, assigned_to, updated_at):
--    định danh, nguồn, bản mã/băm/key_version bất biến sau INSERT.
--  * DELETE: Owner hoặc hệ thống (quyền xóa dữ liệu khách). SELECT: thành viên hoặc ngữ cảnh không người dùng.
--  * assigned_to phải là thành viên ĐANG HOẠT ĐỘNG của chính workspace: trigger DEFINER (kiểm ở DB, không chỉ ở truy vấn).
--  * Mỗi lệnh đúng MỘT policy permissive.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi ghi trong pipeline (ContactSink chưa nối, cờ tắt) nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.leads; DROP FUNCTION cf.guard_lead_assignee(); (và bỏ kỳ vọng ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.leads TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, channel_id, source_type, source_id, phone_enc, phone_hash, phone_last4,
  email_enc, email_hash, key_version) ON cf.leads TO cf_app;
--> statement-breakpoint
GRANT UPDATE (name, note, stage, assigned_to, updated_at) ON cf.leads TO cf_app;
--> statement-breakpoint
CREATE POLICY leads_select ON cf.leads FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY leads_insert ON cf.leads FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY leads_update ON cf.leads FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY leads_delete ON cf.leads FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE FUNCTION cf.guard_lead_assignee() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM core.members m
    WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.assigned_to AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'lead_assignee_not_member' USING ERRCODE = 'check_violation', CONSTRAINT = 'leads_assignee_member';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.guard_lead_assignee() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER leads_guard_assignee
  BEFORE INSERT OR UPDATE OF assigned_to ON cf.leads
  FOR EACH ROW EXECUTE FUNCTION cf.guard_lead_assignee();
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
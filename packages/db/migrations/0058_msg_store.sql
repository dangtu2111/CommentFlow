SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"customer_external_id" text NOT NULL,
	"customer_name" text,
	"last_customer_msg_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"ai_disabled_reason" text,
	"ai_turns" integer DEFAULT 0 NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_channel_external_unique" UNIQUE("channel_id","external_id"),
	CONSTRAINT "conversations_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "conversations_status_check" CHECK ("cf"."conversations"."status" IN ('open', 'resolved')),
	CONSTRAINT "conversations_ai_turns_check" CHECK ("cf"."conversations"."ai_turns" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cf"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_id" text,
	"direction" text NOT NULL,
	"text" text,
	"lang" text,
	"sent_by" text NOT NULL,
	"tag" text,
	"created_time" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_direction_check" CHECK ("cf"."messages"."direction" IN ('in', 'out')),
	CONSTRAINT "messages_sent_by_check" CHECK ("cf"."messages"."sent_by" IN ('customer', 'staff', 'ai')),
	CONSTRAINT "messages_tag_check" CHECK ("cf"."messages"."tag" IS NULL OR "cf"."messages"."tag" = 'HUMAN_AGENT'),
	CONSTRAINT "messages_direction_sender_check" CHECK (("cf"."messages"."direction" = 'in') = ("cf"."messages"."sent_by" = 'customer'))
);
--> statement-breakpoint
ALTER TABLE "cf"."conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."conversations" ADD CONSTRAINT "conversations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."conversations" ADD CONSTRAINT "conversations_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "cf"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_list_idx" ON "cf"."conversations" USING btree ("workspace_id","status","last_message_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "conversations_recent_idx" ON "cf"."conversations" USING btree ("workspace_id","last_message_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "conversations_assignee_idx" ON "cf"."conversations" USING btree ("workspace_id","assigned_to");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_unique" ON "cf"."messages" USING btree ("workspace_id","external_id") WHERE "cf"."messages"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "cf"."messages" USING btree ("workspace_id","conversation_id","created_time");
--> statement-breakpoint
-- ===================================================================================================
-- MSG-STORE (FR-047, Q-MSS1) — feat-msg-store. Nền dữ liệu hội thoại/tin nhắn (chưa có nơi ghi trong pipeline:
-- MESSENGER-INGEST sẽ ghi qua withJob; MSG-INBOX UI đọc/giao việc qua withActor).
--
--  * cf.conversations: một dòng / (kênh, external_id luồng). KHÔNG lưu window_state (cũ theo thời gian): cửa sổ tính
--    từ last_customer_msg_at bằng conversationWindow (@flow/shared), lọc bằng mốc thời gian ở truy vấn.
--  * cf.messages: external_id (mid) duy nhất theo workspace khi có giá trị → webhook gửi lại không trùng (ON CONFLICT).
--    CHECK: direction↔sent_by khớp (in ⇔ customer), tag chỉ NULL|HUMAN_AGENT. Không UPDATE/DELETE (nhật ký bất biến).
--  * RLS: SELECT thành viên đang hoạt động (hoặc không người dùng: withWorkspace/withJob). INSERT conversations CHỈ hệ
--    thống (webhook). INSERT messages: thành viên hoặc hệ thống (nhân viên trả lời). UPDATE conversations: thành viên
--    hoặc hệ thống (đường người dùng chỉ ghi tin direction='out' + sent_by='staff', created_time ép now()), NHƯNG trigger chặn đường người dùng đổi cột do hệ thống quản lý (last_customer_msg_at,
--    last_message_at, ai_turns, customer_*, định danh) — nhân viên không tự kéo dài cửa sổ 24 giờ (R8) — và buộc
--    assigned_to là thành viên đang hoạt động của workspace. Mỗi lệnh đúng MỘT policy permissive. Không DELETE.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng. Đường lùi: DROP TABLE cf.messages, cf.conversations;
-- DROP FUNCTION cf.guard_conversation_user_update(); bỏ kỳ vọng ở check-rls.ts.
-- ===================================================================================================
ALTER TABLE cf.conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.conversations TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, channel_id, external_id, customer_external_id, customer_name,
  last_customer_msg_at, last_message_at, status, ai_enabled, ai_disabled_reason, ai_turns, assigned_to)
  ON cf.conversations TO cf_app;
--> statement-breakpoint
GRANT UPDATE (customer_name, last_customer_msg_at, last_message_at, status, ai_enabled, ai_disabled_reason,
  ai_turns, assigned_to, updated_at) ON cf.conversations TO cf_app;
--> statement-breakpoint
GRANT SELECT ON cf.messages TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, conversation_id, external_id, direction, text, lang, sent_by, tag, created_time)
  ON cf.messages TO cf_app;
--> statement-breakpoint
CREATE POLICY conversations_select ON cf.conversations FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY conversations_insert ON cf.conversations FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY conversations_update ON cf.conversations FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY messages_select ON cf.messages FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
-- Đường người dùng chỉ ghi được tin nhân viên gửi đi (không giả tin khách/AI); thời gian ép = now() bằng trigger.
CREATE POLICY messages_insert ON cf.messages FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_system_context())
      OR ((SELECT core.is_workspace_member()) AND direction = 'out' AND sent_by = 'staff')
    )
  );
--> statement-breakpoint
CREATE FUNCTION cf.guard_message_user_insert() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF NOT core.is_system_context() THEN
    NEW.created_time := now();
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.guard_message_user_insert() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER messages_guard_user_insert
  BEFORE INSERT ON cf.messages
  FOR EACH ROW EXECUTE FUNCTION cf.guard_message_user_insert();
--> statement-breakpoint
CREATE FUNCTION cf.guard_conversation_user_update() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Đường người dùng (ngoài hệ thống): chỉ đổi status, ai_enabled, ai_disabled_reason, assigned_to.
  IF NOT core.is_system_context() AND (
       NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.last_customer_msg_at IS DISTINCT FROM OLD.last_customer_msg_at
    OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
    OR NEW.ai_turns IS DISTINCT FROM OLD.ai_turns
  ) THEN
    RAISE EXCEPTION 'conversations: cột do hệ thống quản lý, người dùng chỉ sửa status, ai_enabled, ai_disabled_reason, assigned_to'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT core.is_system_context() THEN
    NEW.updated_at := now();
  END IF;
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT EXISTS (
       SELECT 1 FROM core.members m
       WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.assigned_to AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'conversations: người xử lý phải là thành viên đang hoạt động của workspace'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.guard_conversation_user_update() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER conversations_guard_user_update
  BEFORE UPDATE ON cf.conversations
  FOR EACH ROW EXECUTE FUNCTION cf.guard_conversation_user_update();
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"pattern" text NOT NULL,
	"action" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"shadow_until" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_name_check" CHECK (char_length("cf"."rules"."name") BETWEEN 1 AND 80),
	CONSTRAINT "rules_type_check" CHECK ("cf"."rules"."type" IN ('keyword', 'regex', 'phone', 'link', 'emoji_only', 'tag_only')),
	CONSTRAINT "rules_action_check" CHECK ("cf"."rules"."action" IN ('mark', 'skip')),
	CONSTRAINT "rules_pattern_len_check" CHECK (char_length("cf"."rules"."pattern") <= 200),
	CONSTRAINT "rules_pattern_shape_check" CHECK (("cf"."rules"."type" IN ('keyword', 'regex') AND "cf"."rules"."pattern" <> '') OR ("cf"."rules"."type" NOT IN ('keyword', 'regex') AND "cf"."rules"."pattern" = ''))
);
--> statement-breakpoint
ALTER TABLE "cf"."rules" ADD CONSTRAINT "rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."rules" ADD CONSTRAINT "rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rules_workspace_idx" ON "cf"."rules" USING btree ("workspace_id","created_at");
--> statement-breakpoint
-- ===================================================================================================
-- SPAM-RULES-STORE (FR-080, docs/10 §3.5 `rules`, Q-SRS1) — feat-spam-rules-store.
-- Quy tắc spam theo workspace: cf.rules. CHỈ LƯU; việc chạy quy tắc trên bình luận mới là việc sau.
--
--  * Chỉ OWNER (hoặc hệ thống) ghi — Staff và withWorkspace trần chỉ đọc. Mỗi lệnh đúng MỘT policy permissive.
--  * created_by: đường Owner BẮT BUỘC = chính người ghi (không giả danh); đường hệ thống BẮT BUỘC null
--    (viết num_nonnulls(created_by) = 0 vì check-rls cấm chuỗi `IS NULL` trong policy ghi — như 0048).
--  * Nội dung bất biến: GRANT UPDATE chỉ (enabled, shadow_until, updated_at); đổi nội dung = xóa + tạo lại.
--  * action chỉ mark/skip: DB từ chối auto_hide (AI/quy tắc không tự ẩn; Tự ẩn là AUTO-HIDE, việc riêng).
--  * Trần 50 quy tắc/workspace do truy vấn tạo giữ (khóa tư vấn theo workspace), không phải DB.
--
-- TRIỂN KHAI: migrate trước; không có nơi đọc trong pipeline/worker nên không cần phối hợp.
-- Đường lùi: DROP TABLE cf.rules; (và bỏ kỳ vọng ở check-rls.ts) — web về `unavailable`.
-- ===================================================================================================
ALTER TABLE cf.rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.rules TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, name, type, pattern, action, created_by) ON cf.rules TO cf_app;
--> statement-breakpoint
GRANT UPDATE (enabled, shadow_until, updated_at) ON cf.rules TO cf_app;
--> statement-breakpoint
CREATE POLICY rules_select ON cf.rules FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY rules_insert ON cf.rules FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND created_by = (SELECT core.current_user_id()))
      OR ((SELECT core.is_system_context()) AND num_nonnulls(created_by) = 0)
    )
  );
--> statement-breakpoint
CREATE POLICY rules_update ON cf.rules FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY rules_delete ON cf.rules FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

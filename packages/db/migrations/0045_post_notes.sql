SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."post_auto_overrides" (
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_auto_overrides_pk" PRIMARY KEY("workspace_id","post_id"),
	CONSTRAINT "post_auto_overrides_mode_check" CHECK ("cf"."post_auto_overrides"."mode" IN ('off', 'shadow'))
);
--> statement-breakpoint
CREATE TABLE "cf"."post_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"content" text NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_notes_content_check" CHECK (char_length("cf"."post_notes"."content") between 1 and 1000),
	CONSTRAINT "post_notes_range_check" CHECK ("cf"."post_notes"."valid_to" IS NULL OR "cf"."post_notes"."valid_to" > "cf"."post_notes"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "cf"."post_auto_overrides" ADD CONSTRAINT "post_auto_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."post_auto_overrides" ADD CONSTRAINT "post_auto_overrides_post_fk" FOREIGN KEY ("workspace_id","post_id") REFERENCES "cf"."posts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."post_notes" ADD CONSTRAINT "post_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."post_notes" ADD CONSTRAINT "post_notes_post_fk" FOREIGN KEY ("workspace_id","post_id") REFERENCES "cf"."posts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_notes_post_idx" ON "cf"."post_notes" USING btree ("workspace_id","post_id","valid_to");
--> statement-breakpoint
-- ===================================================================================================
-- POST-NOTES (FR-062, US-033, Q-PN1) — feat-post-notes. Ghi chú theo bài có hạn + ghi đè chế độ tự động theo bài.
--
--  * cf.post_notes: nội dung 1–1000 ký tự, valid_from (mặc định now()), valid_to tùy chọn (> valid_from; loại trừ).
--    Hết hạn tính ở code/truy vấn (không job xóa). FK ghép (workspace_id, post_id) → posts, xóa bài thì xóa ghi chú.
--  * cf.post_auto_overrides: mỗi bài tối đa một dòng (PK ghép); mode CHỈ 'off' | 'shadow' (CHECK) — ghi đè chỉ SIẾT,
--    không bao giờ bật 'auto' (AGENTS.md nguyên tắc 3: tự gửi chỉ khi Owner bật ở tầng kênh/workspace). Bỏ ghi đè = xóa dòng.
--  * RLS cả hai bảng: SELECT cho thành viên đang hoạt động (hoặc ngữ cảnh không người dùng: withWorkspace/withJob).
--    INSERT/UPDATE/DELETE: Owner hoặc hệ thống của đúng workspace (US-033 "Là Owner"); Staff và withWorkspace trần chỉ đọc.
--    Cột định danh (workspace_id, post_id) không nằm trong GRANT UPDATE. Mỗi lệnh đúng MỘT policy permissive.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng trong pipeline (chờ DATA-PRIORITY) nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.post_notes, cf.post_auto_overrides; (và bỏ kỳ vọng ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.post_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.post_auto_overrides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.post_notes TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, post_id, content, valid_from, valid_to) ON cf.post_notes TO cf_app;
--> statement-breakpoint
GRANT UPDATE (content, valid_from, valid_to, updated_at) ON cf.post_notes TO cf_app;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.post_auto_overrides TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, post_id, mode) ON cf.post_auto_overrides TO cf_app;
--> statement-breakpoint
GRANT UPDATE (mode, updated_at) ON cf.post_auto_overrides TO cf_app;
--> statement-breakpoint
CREATE POLICY post_notes_select ON cf.post_notes FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY post_notes_insert ON cf.post_notes FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY post_notes_update ON cf.post_notes FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY post_notes_delete ON cf.post_notes FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY post_auto_overrides_select ON cf.post_auto_overrides FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY post_auto_overrides_insert ON cf.post_auto_overrides FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY post_auto_overrides_update ON cf.post_auto_overrides FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY post_auto_overrides_delete ON cf.post_auto_overrides FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

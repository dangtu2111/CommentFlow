SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"text" text NOT NULL,
	"lang" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision,
	"needs_human" boolean DEFAULT false NOT NULL,
	"reason" text,
	"model" text,
	"prompt_version" text,
	"kb_version" integer,
	"status" text DEFAULT 'suggested' NOT NULL,
	"not_auto_sent_reason" text,
	"failed_gate" text,
	"final_text" text,
	"edit_distance" integer,
	"trace_id" text,
	"action" text DEFAULT 'answer' NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen_variant" smallint,
	"confidence_components" jsonb,
	"extracted" jsonb,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unanswered_topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"context_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_target_type_check" CHECK ("cf"."drafts"."target_type" in ('comment', 'message')),
	CONSTRAINT "drafts_status_check" CHECK ("cf"."drafts"."status" in ('suggested', 'sent_as_is', 'edited', 'discarded', 'auto_sent', 'would_send')),
	CONSTRAINT "drafts_action_check" CHECK ("cf"."drafts"."action" in ('answer', 'clarify', 'redirect', 'handoff')),
	CONSTRAINT "drafts_lang_check" CHECK ("cf"."drafts"."lang" in ('vi', 'en')),
	CONSTRAINT "drafts_confidence_check" CHECK ("cf"."drafts"."confidence" IS NULL OR ("cf"."drafts"."confidence" >= 0 AND "cf"."drafts"."confidence" <= 1)),
	CONSTRAINT "drafts_edit_distance_check" CHECK ("cf"."drafts"."edit_distance" IS NULL OR "cf"."drafts"."edit_distance" >= 0),
	CONSTRAINT "drafts_chosen_variant_check" CHECK ("cf"."drafts"."chosen_variant" IS NULL OR "cf"."drafts"."chosen_variant" >= 0),
	CONSTRAINT "drafts_price_snapshot_check" CHECK (jsonb_typeof("cf"."drafts"."price_snapshot") = 'array')
);
--> statement-breakpoint
ALTER TABLE "cf"."drafts" ADD CONSTRAINT "drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_target_idx" ON "cf"."drafts" USING btree ("workspace_id","target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "drafts_workspace_status_idx" ON "cf"."drafts" USING btree ("workspace_id","status","created_at");
--> statement-breakpoint
-- ===================================================================================================
-- DRAFTS (FR-029, FR-111, docs/10 `drafts`, Q-PS1) — feat-price-snapshot. Bản nháp AI + ảnh chụp giá lúc soạn.
--
--  * INSERT: CHỈ hệ thống (pipeline soạn, withJob) — nhân viên không tự tạo "bản nháp AI" (chống làm giả nguồn/giá).
--  * UPDATE: thành viên đang hoạt động hoặc hệ thống, nhưng GRANT chỉ cho cột xử lý (status, final_text, edit_distance,
--    chosen_variant, not_auto_sent_reason, failed_gate, updated_at). `price_snapshot`, `text`, `sources`, `claims`...
--    KHÔNG nằm trong GRANT UPDATE → bất biến sau INSERT (R5 của sendRecheck không bị qua mặt).
--    USING + WITH CHECK: đường người dùng không sửa được dòng đã ở trạng thái do hệ thống đặt ('auto_sent',
--    'would_send') và không đặt được các trạng thái đó — chống giả/sửa lịch sử "AI đã tự gửi" (FR-075).
--  * SELECT: thành viên hoặc ngữ cảnh không người dùng (withWorkspace/withJob). Không DELETE (xóa lan theo workspace).
--  * Mỗi lệnh đúng MỘT policy permissive.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi ghi trong pipeline (PIPE-*), nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.drafts; (và bỏ kỳ vọng ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.drafts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.drafts TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, target_type, target_id, text, lang, sources, confidence, needs_human, reason, model,
  prompt_version, kb_version, status, not_auto_sent_reason, failed_gate, final_text, edit_distance, trace_id, action,
  variants, chosen_variant, confidence_components, extracted, claims, unanswered_topics, context_refs, price_snapshot)
  ON cf.drafts TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status, not_auto_sent_reason, failed_gate, final_text, edit_distance, chosen_variant, updated_at)
  ON cf.drafts TO cf_app;
--> statement-breakpoint
CREATE POLICY drafts_select ON cf.drafts FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY drafts_insert ON cf.drafts FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY drafts_update ON cf.drafts FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_system_context())
      OR ((SELECT core.is_workspace_member()) AND status IN ('suggested', 'sent_as_is', 'edited', 'discarded'))
    )
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_system_context())
      OR ((SELECT core.is_workspace_member()) AND status IN ('suggested', 'sent_as_is', 'edited', 'discarded'))
    )
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

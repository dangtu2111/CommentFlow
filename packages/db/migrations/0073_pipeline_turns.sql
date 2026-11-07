-- PIPE-ORCHESTRATOR lát C (docs/plans/feat-pipe-orchestrator.md; Q-POR3): khóa DUY NHẤT theo bình luận cho một lượt xử lý AI.
-- Mục đích: trừ lượt AI (FR-090) IDEMPOTENT — mỗi bình luận chỉ trừ MỘT lần dù job chạy trùng/đồng thời/crash giữa chừng; đếm số lần thử
-- để hết lần thì chuyển "Cần nhân viên" thay vì kẹt `processing`.
--  * comment_id UNIQUE (PRIMARY KEY): hai job cùng bình luận chỉ có MỘT dòng.
--  * charged_at: thời điểm đã trừ lượt; GHI MỘT LẦN (trigger chặn sửa/xóa sau khi đã đặt) — "đã trừ" không thể bị quên hoặc đảo.
--  * attempts: số lần giành quyền xử lý (tăng mỗi lần chạy); state: processing | done | blocked | failed.
--  * locked_until: "thuê" ngắn khi một job đang xử lý; job TRÙNG/đồng thời thấy còn thuê → bỏ qua (busy), KHÔNG tăng attempts và KHÔNG gọi
--    LLM trùng. Job lỗi nhả thuê (NULL); crash cứng thì thuê tự hết hạn.
-- RLS: có workspace_id → bật RLS; thành viên workspace chỉ ĐỌC; chỉ hệ thống (withJob) ghi; không DELETE (xóa lan theo bình luận/workspace).
-- Chỉ THÊM bảng mới (chưa có dữ liệu cần giữ), không đổi bảng cũ. Quyền cho cf_app (worker dùng chung vai trò) theo cột.
-- Đường lùi: DROP TABLE cf.pipeline_turns; DROP FUNCTION cf.guard_pipeline_turn_charged();
CREATE TABLE "cf"."pipeline_turns" (
	"comment_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"charged_at" timestamp with time zone,
	"attempts" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"last_error" text,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_turns_attempts_check" CHECK ("cf"."pipeline_turns"."attempts" >= 1),
	CONSTRAINT "pipeline_turns_state_check" CHECK ("cf"."pipeline_turns"."state" IN ('processing', 'done', 'blocked', 'failed')),
	CONSTRAINT "pipeline_turns_error_check" CHECK ("cf"."pipeline_turns"."last_error" IS NULL OR char_length("cf"."pipeline_turns"."last_error") <= 200)
);
--> statement-breakpoint
ALTER TABLE "cf"."pipeline_turns" ADD CONSTRAINT "pipeline_turns_comment_fk" FOREIGN KEY ("workspace_id","comment_id") REFERENCES "cf"."comments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."pipeline_turns" ADD CONSTRAINT "pipeline_turns_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pipeline_turns_workspace_state_idx" ON "cf"."pipeline_turns" USING btree ("workspace_id","state","updated_at");
--> statement-breakpoint
ALTER TABLE cf.pipeline_turns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.pipeline_turns TO cf_app;
--> statement-breakpoint
GRANT INSERT (comment_id, workspace_id, charged_at, attempts, state, last_error, locked_until) ON cf.pipeline_turns TO cf_app;
--> statement-breakpoint
GRANT UPDATE (charged_at, attempts, state, last_error, locked_until, updated_at) ON cf.pipeline_turns TO cf_app;
--> statement-breakpoint
CREATE POLICY pipeline_turns_select ON cf.pipeline_turns FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY pipeline_turns_insert ON cf.pipeline_turns FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY pipeline_turns_update ON cf.pipeline_turns FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE FUNCTION cf.guard_pipeline_turn_charged() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  -- charged_at đã đặt thì không được sửa/xóa: "đã trừ lượt" là sự thật một chiều (không trừ hai lần, không quên trừ).
  IF OLD.charged_at IS NOT NULL AND NEW.charged_at IS DISTINCT FROM OLD.charged_at THEN
    RAISE EXCEPTION 'pipeline_turns.charged_at không được sửa sau khi đã trừ lượt' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pipeline_turns_guard_charged BEFORE UPDATE ON cf.pipeline_turns
  FOR EACH ROW EXECUTE FUNCTION cf.guard_pipeline_turn_charged();

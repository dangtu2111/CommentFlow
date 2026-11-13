-- KB-TESTSET-PERSIST (trang "Độ sẵn sàng AI & Kiểm thử"): lưu BỘ CÂU KIỂM THỬ của workspace + kết quả lần chạy gần nhất của từng câu.
-- Câu hỏi + hành động mong đợi + từ khóa phải có (giống dòng "câu hỏi | hành động | từ khóa" ở form cũ). Kết quả chỉ là trạng thái lần chạy cuối (đạt/không đạt/lỗi, hành động thực tế, câu trả lời, mã lỗi) — không lưu lịch sử.
-- Quyền: cf_app chỉ SELECT và CHỈ Owner thấy (RLS); ghi qua hàm DEFINER, tất cả CHỈ Owner (withActor): add_kb_test_cases (≤ 20 câu/lần, tối đa 100 câu/workspace), delete_kb_test_case, record_kb_test_run.
-- Chỉ THÊM bảng và hàm; không đổi bảng/hàm hiện có.
-- Đường lùi: DROP FUNCTION cf.record_kb_test_run(jsonb), cf.delete_kb_test_case(uuid), cf.add_kb_test_cases(jsonb); DROP TABLE cf.kb_test_cases (mất bộ câu đã lưu; không ảnh hưởng kiến thức/bài đăng/bình luận).
CREATE TABLE "cf"."kb_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"question" text NOT NULL,
	"expect_action" text NOT NULL,
	"reply_includes" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" text,
	"last_actual" text,
	"last_reply" text,
	"last_failures" text[] DEFAULT '{}' NOT NULL,
	"last_run_at" timestamp with time zone,
	CONSTRAINT "kb_test_cases_question_check" CHECK (char_length("question") BETWEEN 1 AND 500),
	CONSTRAINT "kb_test_cases_expect_check" CHECK ("expect_action" IN ('answer', 'clarify', 'redirect', 'handoff', 'skip')),
	CONSTRAINT "kb_test_cases_keywords_check" CHECK (cardinality("reply_includes") <= 5),
	CONSTRAINT "kb_test_cases_status_check" CHECK ("last_status" IS NULL OR "last_status" IN ('pass', 'fail', 'error')),
	CONSTRAINT "kb_test_cases_actual_check" CHECK ("last_actual" IS NULL OR "last_actual" IN ('answer', 'clarify', 'redirect', 'handoff', 'skip')),
	CONSTRAINT "kb_test_cases_reply_check" CHECK ("last_reply" IS NULL OR char_length("last_reply") <= 4000)
);
--> statement-breakpoint
ALTER TABLE "cf"."kb_test_cases" ADD CONSTRAINT "kb_test_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."kb_test_cases" ADD CONSTRAINT "kb_test_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "kb_test_cases_workspace_created_idx" ON "cf"."kb_test_cases" ("workspace_id", "created_at");
--> statement-breakpoint
ALTER TABLE cf.kb_test_cases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.kb_test_cases TO cf_app;
--> statement-breakpoint
CREATE POLICY kb_test_cases_select ON cf.kb_test_cases FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_owner())
  );
--> statement-breakpoint

-- Owner thêm một nhóm câu (mảng JSON [{question, expectAction, replyIncludes[]}]). Tối đa 20 câu/lần và 100 câu/workspace; giá trị sai bị CHECK của bảng chặn (23514).
CREATE FUNCTION cf.add_kb_test_cases(p_cases jsonb) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_count integer;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_cases IS NULL OR jsonb_typeof(p_cases) <> 'array' OR jsonb_array_length(p_cases) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'invalid cases' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_cases);
  IF (SELECT count(*) FROM cf.kb_test_cases WHERE workspace_id = v_ws) + v_count > 100 THEN
    RAISE EXCEPTION 'too many test cases' USING ERRCODE = '53400';
  END IF;
  INSERT INTO cf.kb_test_cases (workspace_id, question, expect_action, reply_includes, created_by)
  SELECT v_ws,
         btrim(e ->> 'question'),
         e ->> 'expectAction',
         coalesce(ARRAY(SELECT btrim(k) FROM jsonb_array_elements_text(coalesce(e -> 'replyIncludes', '[]'::jsonb)) AS k), '{}'::text[]),
         core.current_user_id()
    FROM jsonb_array_elements(p_cases) WITH ORDINALITY AS t(e, o)
   ORDER BY o;
  RETURN v_count;
END
$$;
--> statement-breakpoint

CREATE FUNCTION cf.delete_kb_test_case(p_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM cf.kb_test_cases WHERE id = p_id AND workspace_id = v_ws;
END
$$;
--> statement-breakpoint

-- Owner ghi kết quả lần chạy cuối cho nhiều câu: mảng JSON [{id, status, actual, reply, failures[]}]. Câu không thuộc workspace bị bỏ qua.
CREATE FUNCTION cf.record_kb_test_run(p_results jsonb) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' OR jsonb_array_length(p_results) > 100 THEN
    RAISE EXCEPTION 'invalid results' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.kb_test_cases c
     SET last_status = r ->> 'status',
         last_actual = nullif(r ->> 'actual', ''),
         last_reply = left(nullif(r ->> 'reply', ''), 4000),
         last_failures = coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(r -> 'failures', '[]'::jsonb))), '{}'::text[]),
         last_run_at = now()
    FROM jsonb_array_elements(p_results) AS r
   WHERE c.workspace_id = v_ws AND c.id = (r ->> 'id')::uuid;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.add_kb_test_cases(jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.delete_kb_test_case(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.record_kb_test_run(jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.add_kb_test_cases(jsonb) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.delete_kb_test_case(uuid) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.record_kb_test_run(jsonb) TO cf_app;

SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."kb_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"sample_question_masked" text NOT NULL,
	"product_id" uuid,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_gaps_topic_check" CHECK ("cf"."kb_gaps"."topic" IN ('shipping', 'discount', 'product_info', 'policy', 'order_status', 'size', 'other')),
	CONSTRAINT "kb_gaps_status_check" CHECK ("cf"."kb_gaps"."status" IN ('open', 'resolved', 'ignored')),
	CONSTRAINT "kb_gaps_count_check" CHECK ("cf"."kb_gaps"."count" >= 1),
	CONSTRAINT "kb_gaps_text_check" CHECK (char_length("cf"."kb_gaps"."sample_question_masked") BETWEEN 1 AND 500),
	CONSTRAINT "kb_gaps_resolved_source_check" CHECK ("cf"."kb_gaps"."status" = 'resolved' OR "cf"."kb_gaps"."resolved_by_source_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "cf"."retrieval_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"draft_id" uuid,
	"comment_id" uuid,
	"query_masked" text NOT NULL,
	"lang" text NOT NULL,
	"kb_version" integer,
	"route" text NOT NULL,
	"search_query_masked" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"used_chunk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"resolved_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrieval_logs_lang_check" CHECK ("cf"."retrieval_logs"."lang" IN ('vi', 'en')),
	CONSTRAINT "retrieval_logs_route_check" CHECK ("cf"."retrieval_logs"."route" IN ('sql', 'hybrid', 'both')),
	CONSTRAINT "retrieval_logs_latency_check" CHECK ("cf"."retrieval_logs"."latency_ms" >= 0),
	CONSTRAINT "retrieval_logs_kb_version_check" CHECK ("cf"."retrieval_logs"."kb_version" IS NULL OR "cf"."retrieval_logs"."kb_version" >= 1),
	CONSTRAINT "retrieval_logs_candidates_check" CHECK (jsonb_typeof("cf"."retrieval_logs"."candidates") = 'array' AND jsonb_array_length("cf"."retrieval_logs"."candidates") <= 50),
	CONSTRAINT "retrieval_logs_used_chunks_check" CHECK (cardinality("cf"."retrieval_logs"."used_chunk_ids") <= 20),
	CONSTRAINT "retrieval_logs_products_check" CHECK (cardinality("cf"."retrieval_logs"."resolved_product_ids") <= 20),
	CONSTRAINT "retrieval_logs_text_check" CHECK (char_length("cf"."retrieval_logs"."query_masked") BETWEEN 1 AND 500 AND ("cf"."retrieval_logs"."search_query_masked" IS NULL OR char_length("cf"."retrieval_logs"."search_query_masked") <= 500))
);
--> statement-breakpoint
ALTER TABLE "cf"."kb_gaps" ADD CONSTRAINT "kb_gaps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_gaps" ADD CONSTRAINT "kb_gaps_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "cf"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_gaps" ADD CONSTRAINT "kb_gaps_source_fk" FOREIGN KEY ("workspace_id","resolved_by_source_id") REFERENCES "cf"."kb_sources"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."retrieval_logs" ADD CONSTRAINT "retrieval_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kb_gaps_key_unique" ON "cf"."kb_gaps" USING btree ("workspace_id","topic",coalesce("product_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "kb_gaps_workspace_status_idx" ON "cf"."kb_gaps" USING btree ("workspace_id","status","last_seen_at");--> statement-breakpoint
CREATE INDEX "retrieval_logs_workspace_draft_idx" ON "cf"."retrieval_logs" USING btree ("workspace_id","draft_id");--> statement-breakpoint
CREATE INDEX "retrieval_logs_created_idx" ON "cf"."retrieval_logs" USING btree ("created_at");--> statement-breakpoint
-- ===================================================================================================
-- RETRIEVAL-LOG (FR-134, Q-RL1) — feat-retrieval-log. Nhật ký tìm kiếm + "Câu hỏi AI chưa trả lời được".
--
--  * cf.retrieval_logs: CHỈ THÊM. INSERT chỉ ngữ cảnh job HỆ THỐNG (core.is_system_context(), kết nối cf_worker) của đúng
--    workspace; KHÔNG GRANT/policy UPDATE hay DELETE cho cf_app. SELECT: thành viên đang hoạt động của workspace, hoặc ngữ
--    cảnh không người dùng (withWorkspace/withJob). Mọi chuỗi do nơi gọi che PII (maskPii) trước khi ghi; DB chỉ chặn độ
--    dài/hình dạng bằng CHECK. Dọn 90 ngày bằng hàm cf.purge_expired_retrieval_logs (job retention của worker).
--  * cf.kb_gaps: gộp theo (workspace, chủ đề, sản phẩm) bằng chỉ mục duy nhất trên coalesce(product_id, uuid-0).
--    INSERT chỉ hệ thống. UPDATE: hệ thống (đếm: count, last_seen_at, sample_question_masked) hoặc thành viên đang hoạt
--    động (status, resolved_by_source_id); policy không chia theo cột nên trigger kb_gaps_guard_update chặn thành viên
--    sửa cột đếm. Cột định danh (workspace_id, topic, product_id, first_seen_at) không nằm trong GRANT UPDATE. Không DELETE.
--    Khóa ngoại ghép (workspace_id, product_id)/(workspace_id, resolved_by_source_id): không trỏ chéo workspace.
--  * Mỗi lệnh đúng MỘT policy permissive (không có policy thứ hai mở lại quyền).
--  * cf.purge_expired_retrieval_logs(p_days): mẫu cf.purge_expired_webhook_payloads (0026): chỉ NGỮ CẢNH TRẦN, cận dưới
--    30 ngày (CF422), CHỈ kết nối cf_worker (EXECUTE chỉ cf_worker + session_user), xóa tối đa 20000 dòng/lần (job
--    chạy mỗi giờ ≈ 480 nghìn dòng/ngày; nếu tồn đọng thì cho job lặp), idempotent.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi ghi trong pipeline (chờ PIPE-RETRIEVE) nên không cần phối hợp bản worker.
-- Đường lùi: DROP FUNCTION cf.purge_expired_retrieval_logs(integer); DROP TABLE cf.kb_gaps, cf.retrieval_logs;
-- DROP FUNCTION cf.kb_gaps_guard_update(); và lùi check-rls.ts + job retention. Mất nhật ký/gap đã ghi (dữ liệu suy ra).
-- ===================================================================================================
ALTER TABLE cf.retrieval_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.kb_gaps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

GRANT SELECT ON cf.retrieval_logs TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, draft_id, comment_id, query_masked, lang, kb_version, route, search_query_masked,
  candidates, used_chunk_ids, resolved_product_ids, latency_ms, created_at) ON cf.retrieval_logs TO cf_app;
--> statement-breakpoint
GRANT SELECT ON cf.kb_gaps TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, topic, sample_question_masked, product_id) ON cf.kb_gaps TO cf_app;
--> statement-breakpoint
GRANT UPDATE (count, sample_question_masked, last_seen_at, status, resolved_by_source_id, updated_at)
  ON cf.kb_gaps TO cf_app;
--> statement-breakpoint

CREATE POLICY retrieval_logs_select ON cf.retrieval_logs FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY retrieval_logs_insert ON cf.retrieval_logs FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY kb_gaps_select ON cf.kb_gaps FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY kb_gaps_insert ON cf.kb_gaps FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY kb_gaps_update ON cf.kb_gaps FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_member()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint

CREATE FUNCTION cf.kb_gaps_guard_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Thành viên chỉ đổi trạng thái; cột đếm/mẫu câu hỏi chỉ job hệ thống ghi (fail-closed với NULL).
  IF core.is_system_context() IS NOT TRUE
     AND (NEW.count IS DISTINCT FROM OLD.count
          OR NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at
          OR NEW.sample_question_masked IS DISTINCT FROM OLD.sample_question_masked) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER kb_gaps_guard_update BEFORE UPDATE ON cf.kb_gaps
  FOR EACH ROW EXECUTE FUNCTION cf.kb_gaps_guard_update();
--> statement-breakpoint

CREATE FUNCTION cf.purge_expired_retrieval_logs(p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- Chỉ ngữ cảnh trần: không workspace, không người dùng, không phải job hệ thống (fail-closed với NULL).
  IF session_user <> 'cf_worker'
     OR core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  -- Cận dưới 30 ngày: gọi nhầm (lỗi lập trình) không thể xóa nhật ký còn trong hạn dùng để đo recall.
  IF p_days IS NULL OR p_days < 30 THEN
    RAISE EXCEPTION 'invalid_days' USING ERRCODE = 'CF422';
  END IF;

  DELETE FROM cf.retrieval_logs
   WHERE id IN (SELECT id FROM cf.retrieval_logs
                 WHERE created_at < now() - make_interval(days => p_days)
                 ORDER BY created_at LIMIT 20000);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.purge_expired_retrieval_logs(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.purge_expired_retrieval_logs(integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
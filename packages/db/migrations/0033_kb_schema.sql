SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'
                 AND string_to_array(extversion, '.')::int[] >= ARRAY[0,7]) THEN
    RAISE EXCEPTION 'KB-SCHEMA cần extension vector >= 0.7 (halfvec); tạo ở bước khởi tạo DB';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "cf"."kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"version_id" uuid,
	"chunk_key" text NOT NULL,
	"injection_suspected" boolean DEFAULT false NOT NULL,
	"injection_reason" text,
	"content" text NOT NULL,
	"lang" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" halfvec(1024),
	"tsv" "tsvector",
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"context_header" text,
	"product_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_chunks_key_unique" UNIQUE NULLS NOT DISTINCT("workspace_id","source_id","version_id","chunk_key"),
	CONSTRAINT "kb_chunks_lang_check" CHECK ("cf"."kb_chunks"."lang" in ('vi', 'en')),
	CONSTRAINT "kb_chunks_published_version_check" CHECK ("cf"."kb_chunks"."is_draft" or "cf"."kb_chunks"."version_id" is not null),
	CONSTRAINT "kb_chunks_valid_range_check" CHECK ("cf"."kb_chunks"."valid_from" is null or "cf"."kb_chunks"."valid_until" is null or "cf"."kb_chunks"."valid_until" > "cf"."kb_chunks"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "cf"."kb_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"origin_url" text,
	"external_key" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_sources_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "kb_sources_type_check" CHECK ("cf"."kb_sources"."type" in ('manual', 'faq', 'excel', 'shopify', 'url', 'policy')),
	CONSTRAINT "kb_sources_status_check" CHECK ("cf"."kb_sources"."status" in ('active', 'syncing', 'error'))
);
--> statement-breakpoint
CREATE TABLE "cf"."kb_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"changed_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "kb_versions_workspace_number_unique" UNIQUE("workspace_id","number"),
	CONSTRAINT "kb_versions_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "kb_versions_number_check" CHECK ("cf"."kb_versions"."number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "cf"."kb_chunks" ADD CONSTRAINT "kb_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_chunks" ADD CONSTRAINT "kb_chunks_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "cf"."kb_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_chunks" ADD CONSTRAINT "kb_chunks_version_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "cf"."kb_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_sources" ADD CONSTRAINT "kb_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_versions" ADD CONSTRAINT "kb_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."kb_versions" ADD CONSTRAINT "kb_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_chunks_workspace_version_idx" ON "cf"."kb_chunks" USING btree ("workspace_id","version_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_tsv_idx" ON "cf"."kb_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "kb_chunks_workspace_product_idx" ON "cf"."kb_chunks" USING btree ("workspace_id","product_id") WHERE "cf"."kb_chunks"."product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "kb_sources_external_key_unique" ON "cf"."kb_sources" USING btree ("workspace_id","type","external_key") WHERE "cf"."kb_sources"."external_key" is not null and "cf"."kb_sources"."deleted_at" is null;

-- ===================================================================================================
-- Phần viết tay (feat/kb-schema, KB-SCHEMA, QKB1): RLS + quyền bảng/cột. Mẫu migration 0019 (ADR 005 §3, ADR 007).
--  * Ba đường: người dùng (withActor), HỆ THỐNG (withJob → core.is_system_context(), chỉ role cf_worker) và withWorkspace
--    trần (chỉ ĐỌC; quên withActor ở route web thì bị từ chối ghi, fail-closed).
--  * SELECT: workspace hiện tại VÀ (không có người dùng HOẶC thành viên đang hoạt động).
--  * kb_sources: INSERT/UPDATE Owner đang hoạt động hoặc hệ thống; KHÔNG DELETE (xóa mềm deleted_at); UPDATE theo cột
--    (không đổi workspace_id, type, external_key).
--  * kb_versions: INSERT Owner hoặc hệ thống; bất biến (không UPDATE/DELETE).
--  * kb_chunks: INSERT/UPDATE/DELETE chỉ hệ thống (worker lập chỉ mục; người dùng không ghi trực tiếp, FR-164); UPDATE theo
--    cột (không đổi workspace_id, source_id, version_id, chunk_key).
--  * Mỗi lệnh đúng MỘT policy (không có policy permissive thứ hai mở lại quyền).
--
-- Đường lùi: DROP TABLE cf.kb_chunks, cf.kb_versions, cf.kb_sources CASCADE (bảng mới, chưa có dữ liệu thật).
-- ===================================================================================================
--> statement-breakpoint
ALTER TABLE cf.kb_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.kb_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.kb_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON cf.kb_sources TO cf_app;
--> statement-breakpoint
GRANT UPDATE (title, origin_url, status, last_synced_at, sync_error, deleted_at, updated_at) ON cf.kb_sources TO cf_app;
--> statement-breakpoint
CREATE POLICY kb_sources_select ON cf.kb_sources FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY kb_sources_insert ON cf.kb_sources FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY kb_sources_update ON cf.kb_sources FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
GRANT SELECT, INSERT ON cf.kb_versions TO cf_app;
--> statement-breakpoint
CREATE POLICY kb_versions_select ON cf.kb_versions FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY kb_versions_insert ON cf.kb_versions FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND published_by IS NOT DISTINCT FROM (SELECT core.current_user_id()))
      OR (SELECT core.is_system_context())
    )
  );
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON cf.kb_chunks TO cf_app;
--> statement-breakpoint
GRANT UPDATE (injection_suspected, injection_reason, content, lang, content_hash, embedding, tsv, metadata, is_draft,
  context_header, product_id, valid_from, valid_until, embedding_model, updated_at) ON cf.kb_chunks TO cf_app;
--> statement-breakpoint
CREATE POLICY kb_chunks_select ON cf.kb_chunks FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY kb_chunks_insert ON cf.kb_chunks FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY kb_chunks_update ON cf.kb_chunks FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY kb_chunks_delete ON cf.kb_chunks FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
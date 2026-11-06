SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."product_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"alias_norm" text NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_aliases_workspace_norm_product_unique" UNIQUE("workspace_id","alias_norm","product_id"),
	CONSTRAINT "product_aliases_source_check" CHECK ("cf"."product_aliases"."source" IN ('staff', 'import', 'ai_suggested')),
	CONSTRAINT "product_aliases_alias_check" CHECK (char_length("cf"."product_aliases"."alias") between 1 and 100),
	CONSTRAINT "product_aliases_norm_check" CHECK (char_length("cf"."product_aliases"."alias_norm") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "cf"."product_aliases" ADD CONSTRAINT "product_aliases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."product_aliases" ADD CONSTRAINT "product_aliases_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."product_aliases" ADD CONSTRAINT "product_aliases_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "cf"."products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_aliases_product_idx" ON "cf"."product_aliases" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "product_aliases_norm_trgm_idx" ON "cf"."product_aliases" USING gin ("alias_norm" gin_trgm_ops);
--> statement-breakpoint
-- ===================================================================================================
-- PRODUCT-ALIAS (FR-128, US-100, Q-PA1) — feat-product-alias. Bí danh sản phẩm của workspace.
--
--  * RLS: SELECT cho thành viên đang hoạt động (hoặc ngữ cảnh không người dùng: withWorkspace/withJob).
--    INSERT/DELETE: thành viên (Owner VÀ Staff, FR-128) hoặc hệ thống — theo mẫu cf.products, không dùng is_workspace_owner.
--    INSERT: confirmed_by chỉ được trống hoặc là chính người đang ghi; nguồn ai_suggested bắt buộc có người xác nhận.
--  * Invariant "ai_suggested có người xác nhận" chỉ do RLS INSERT giữ (không CHECK: FK confirmed_by ON DELETE SET NULL
--    sẽ chặn xóa người dùng). searchProductsByAlias nhận queryText đã mở rộng viết tắt từ bên gọi.
--  * Không có UPDATE cho cf_app (sửa = xóa + tạo lại). Mỗi lệnh đúng MỘT policy permissive.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng ngoài findProductMatch (nhánh bí danh) nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.product_aliases; (và bỏ nhánh bí danh ở findProductMatch, kỳ vọng ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.product_aliases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.product_aliases TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, product_id, alias, alias_norm, source, confirmed_by) ON cf.product_aliases TO cf_app;
--> statement-breakpoint
CREATE POLICY product_aliases_select ON cf.product_aliases FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY product_aliases_insert ON cf.product_aliases FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
    AND (confirmed_by IS NULL OR confirmed_by = (SELECT core.current_user_id()))
    AND (source <> 'ai_suggested' OR confirmed_by IS NOT NULL)
  );
--> statement-breakpoint
CREATE POLICY product_aliases_delete ON cf.product_aliases FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

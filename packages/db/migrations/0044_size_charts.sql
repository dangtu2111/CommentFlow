SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."size_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid,
	"category" text,
	"category_norm" text,
	"size" text NOT NULL,
	"height_min_cm" numeric(6, 1),
	"height_max_cm" numeric(6, 1),
	"weight_min_kg" numeric(6, 1),
	"weight_max_kg" numeric(6, 1),
	"measures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "size_charts_scope_check" CHECK (num_nonnulls("cf"."size_charts"."product_id", "cf"."size_charts"."category_norm") = 1 AND ("cf"."size_charts"."category" IS NULL) = ("cf"."size_charts"."category_norm" IS NULL)),
	CONSTRAINT "size_charts_size_check" CHECK (char_length("cf"."size_charts"."size") between 1 and 20),
	CONSTRAINT "size_charts_category_check" CHECK ("cf"."size_charts"."category_norm" IS NULL OR (char_length("cf"."size_charts"."category") between 1 and 100 AND char_length("cf"."size_charts"."category_norm") between 1 and 100)),
	CONSTRAINT "size_charts_range_check" CHECK (num_nonnulls("cf"."size_charts"."height_min_cm", "cf"."size_charts"."height_max_cm", "cf"."size_charts"."weight_min_kg", "cf"."size_charts"."weight_max_kg") >= 1
        AND coalesce("cf"."size_charts"."height_min_cm", 1) > 0 AND coalesce("cf"."size_charts"."height_max_cm", 1) > 0
        AND coalesce("cf"."size_charts"."weight_min_kg", 1) > 0 AND coalesce("cf"."size_charts"."weight_max_kg", 1) > 0
        AND ("cf"."size_charts"."height_min_cm" IS NULL OR "cf"."size_charts"."height_max_cm" IS NULL OR "cf"."size_charts"."height_min_cm" <= "cf"."size_charts"."height_max_cm")
        AND ("cf"."size_charts"."weight_min_kg" IS NULL OR "cf"."size_charts"."weight_max_kg" IS NULL OR "cf"."size_charts"."weight_min_kg" <= "cf"."size_charts"."weight_max_kg")),
	CONSTRAINT "size_charts_note_check" CHECK ("cf"."size_charts"."note" IS NULL OR char_length("cf"."size_charts"."note") <= 200),
	CONSTRAINT "size_charts_measures_check" CHECK (jsonb_typeof("cf"."size_charts"."measures") = 'object')
);
--> statement-breakpoint
ALTER TABLE "cf"."size_charts" ADD CONSTRAINT "size_charts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."size_charts" ADD CONSTRAINT "size_charts_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "cf"."products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "size_charts_product_size_unique" ON "cf"."size_charts" USING btree ("workspace_id","product_id","size") WHERE "cf"."size_charts"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "size_charts_category_size_unique" ON "cf"."size_charts" USING btree ("workspace_id","category_norm","size") WHERE "cf"."size_charts"."product_id" IS NULL;--> statement-breakpoint
CREATE INDEX "size_charts_product_idx" ON "cf"."size_charts" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "size_charts_category_idx" ON "cf"."size_charts" USING btree ("workspace_id","category_norm");
--> statement-breakpoint
-- ===================================================================================================
-- SIZE-TABLE (FR-149, US-102, Q-ST1) — feat-size-table. Bảng size có cấu trúc của workspace.
--
--  * Mỗi dòng = một size với khoảng chiều cao/cân nặng; theo sản phẩm (product_id) HOẶC theo danh mục
--    (category_norm), CHECK đúng một. FK ghép (workspace_id, product_id) → products, xóa sản phẩm thì xóa bảng size.
--  * RLS: SELECT cho thành viên đang hoạt động (hoặc ngữ cảnh không người dùng: withWorkspace/withJob).
--    INSERT/UPDATE/DELETE: Owner hoặc hệ thống của đúng workspace (FR-149 "Owner nhập"); Staff và withWorkspace trần
--    chỉ đọc. Cột định danh (workspace_id, product_id, category*) không nằm trong GRANT UPDATE: đổi phạm vi = xóa + tạo lại.
--    Mỗi lệnh đúng MỘT policy permissive.
--  * Tra size do code quyết định (decideSize, @flow/shared); DB chỉ chọn các dòng đúng phạm vi (findSizeChartRows).
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng trong pipeline (chờ nối bước tra size) nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.size_charts; (và bỏ kỳ vọng ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.size_charts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.size_charts TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, product_id, category, category_norm, size, height_min_cm, height_max_cm,
              weight_min_kg, weight_max_kg, measures, note, sort_order) ON cf.size_charts TO cf_app;
--> statement-breakpoint
GRANT UPDATE (size, height_min_cm, height_max_cm, weight_min_kg, weight_max_kg, measures, note, sort_order, updated_at)
  ON cf.size_charts TO cf_app;
--> statement-breakpoint
CREATE POLICY size_charts_select ON cf.size_charts FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY size_charts_insert ON cf.size_charts FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY size_charts_update ON cf.size_charts FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY size_charts_delete ON cf.size_charts FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

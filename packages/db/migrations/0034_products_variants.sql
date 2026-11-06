CREATE TABLE "cf"."product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"external_id" text,
	"sku" text,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attrs_norm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_vnd" bigint,
	"compare_at_vnd" bigint,
	"stock" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_from_source_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_external_unique" UNIQUE("workspace_id","product_id","external_id"),
	CONSTRAINT "product_variants_status_check" CHECK ("cf"."product_variants"."status" IN ('active', 'archived')),
	CONSTRAINT "product_variants_attrs_object_check" CHECK (jsonb_typeof("cf"."product_variants"."attrs") = 'object' AND jsonb_typeof("cf"."product_variants"."attrs_norm") = 'object'),
	CONSTRAINT "product_variants_price_check" CHECK ("cf"."product_variants"."price_vnd" IS NULL OR "cf"."product_variants"."price_vnd" >= 0),
	CONSTRAINT "product_variants_compare_at_check" CHECK ("cf"."product_variants"."compare_at_vnd" IS NULL OR "cf"."product_variants"."compare_at_vnd" >= 0),
	CONSTRAINT "product_variants_stock_check" CHECK ("cf"."product_variants"."stock" IS NULL OR "cf"."product_variants"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cf"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"sku" text,
	"price_vnd" bigint,
	"compare_at_vnd" bigint,
	"stock" integer,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_from_source_at" timestamp with time zone,
	"search_text" text DEFAULT '' NOT NULL,
	"card" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rev" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "products_source_external_unique" UNIQUE("workspace_id","source","external_id"),
	CONSTRAINT "products_source_check" CHECK ("cf"."products"."source" IN ('manual', 'excel', 'google_sheets', 'shopify', 'haravan', 'sapo', 'kiotviet', 'pancake')),
	CONSTRAINT "products_status_check" CHECK ("cf"."products"."status" IN ('active', 'archived')),
	CONSTRAINT "products_card_object_check" CHECK (jsonb_typeof("cf"."products"."card") = 'object'),
	CONSTRAINT "products_price_check" CHECK ("cf"."products"."price_vnd" IS NULL OR "cf"."products"."price_vnd" >= 0),
	CONSTRAINT "products_compare_at_check" CHECK ("cf"."products"."compare_at_vnd" IS NULL OR "cf"."products"."compare_at_vnd" >= 0),
	CONSTRAINT "products_stock_check" CHECK ("cf"."products"."stock" IS NULL OR "cf"."products"."stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD CONSTRAINT "product_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD CONSTRAINT "product_variants_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "cf"."products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "cf"."product_variants" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "product_variants_attrs_norm_idx" ON "cf"."product_variants" USING gin ("attrs_norm");--> statement-breakpoint
CREATE INDEX "products_workspace_status_idx" ON "cf"."products" USING btree ("workspace_id","status");
--> statement-breakpoint
-- ===================================================================================================
-- PRODUCTS-VARIANTS (FR-129, FR-056, FR-058) — feat-products-variants. Thêm cf.products + cf.product_variants.
--
--  * RLS: SELECT hệ thống/withWorkspace trần HOẶC thành viên đang hoạt động; INSERT/UPDATE thành viên đang hoạt động
--    (Owner + Staff, withActor) HOẶC hệ thống (withJob: đồng bộ nguồn). cf_app KHÔNG có DELETE (xóa mềm bằng status).
--  * Cột không sửa được sau khi tạo (không nằm trong GRANT UPDATE): workspace_id, source, external_id (products);
--    workspace_id, product_id (variants); và `rev` — chỉ trigger đặt.
--  * products.rev (FR-135): +1 khi price_vnd/compare_at_vnd/stock/status/variants của sản phẩm đổi (trigger BEFORE UPDATE,
--    bỏ qua giá trị rev do client gửi) và khi biến thể thêm/đổi giá-tồn-trạng thái-thuộc tính/xóa (trigger DEFINER vì
--    cf_app không có quyền ghi cột rev; mọi UPDATE giới hạn theo workspace_id + id của dòng kích hoạt).
--  * Không có name_embedding/search_text trigram ở đây (KB-SEARCH-FTS cần pgvector/pg_trgm).
--
-- Đường lùi: DROP TABLE cf.product_variants, cf.products CASCADE; DROP FUNCTION cf.products_set_rev(),
-- cf.bump_product_rev_from_variant(). PHẢI lùi cả check-rls (ACTOR_POLICIES/FORBIDDEN/NO_DELETE/cột cấm UPDATE), nếu
-- không `pnpm db:check-rls` đỏ. Mất toàn bộ dữ liệu sản phẩm/biến thể.
-- ===================================================================================================

ALTER TABLE cf.products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.product_variants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

GRANT SELECT ON cf.products TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, source, external_id, name, sku, price_vnd, compare_at_vnd, stock, variants, url,
  locked_fields, updated_from_source_at, search_text, card, status, category, created_at, updated_at)
  ON cf.products TO cf_app;
--> statement-breakpoint
GRANT UPDATE (name, sku, price_vnd, compare_at_vnd, stock, variants, url, locked_fields, updated_from_source_at,
  search_text, card, status, category, updated_at) ON cf.products TO cf_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cf.product_variants TO cf_app;
--> statement-breakpoint
GRANT UPDATE (sku, attrs, attrs_norm, price_vnd, compare_at_vnd, stock, status, updated_from_source_at,
  updated_at) ON cf.product_variants TO cf_app;
--> statement-breakpoint

CREATE POLICY products_select ON cf.products FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY products_insert ON cf.products FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY products_update ON cf.products FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY product_variants_select ON cf.product_variants FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY product_variants_insert ON cf.product_variants FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY product_variants_update ON cf.product_variants FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint

-- rev của sản phẩm: client không đặt được (bỏ qua giá trị gửi lên); tăng khi trường ảnh hưởng giá/tồn đổi.
-- pg_trigger_depth() > 1 = đang bị trigger biến thể gọi: giữ nguyên rev mà trigger đó đã tăng.
CREATE FUNCTION cf.products_set_rev() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cf, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  NEW.rev := OLD.rev;
  IF NEW.price_vnd IS DISTINCT FROM OLD.price_vnd
     OR NEW.compare_at_vnd IS DISTINCT FROM OLD.compare_at_vnd
     OR NEW.stock IS DISTINCT FROM OLD.stock
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.variants IS DISTINCT FROM OLD.variants THEN
    NEW.rev := OLD.rev + 1;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.products_set_rev() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER products_set_rev
  BEFORE UPDATE ON cf.products
  FOR EACH ROW EXECUTE FUNCTION cf.products_set_rev();
--> statement-breakpoint

-- Biến thể đổi → tăng products.rev. DEFINER: cf_app không có quyền UPDATE cột rev. Chỉ chạm đúng một sản phẩm
-- (workspace_id + product_id của dòng kích hoạt; khóa ngoại ghép đảm bảo cùng workspace).
CREATE FUNCTION cf.bump_product_rev_from_variant() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cf, pg_temp
AS $$
DECLARE
  v_ws uuid;
  v_product uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.price_vnd IS NOT DISTINCT FROM OLD.price_vnd
     AND NEW.compare_at_vnd IS NOT DISTINCT FROM OLD.compare_at_vnd
     AND NEW.stock IS NOT DISTINCT FROM OLD.stock
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.attrs_norm IS NOT DISTINCT FROM OLD.attrs_norm THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_ws := OLD.workspace_id;
    v_product := OLD.product_id;
  ELSE
    v_ws := NEW.workspace_id;
    v_product := NEW.product_id;
  END IF;
  UPDATE cf.products SET rev = rev + 1 WHERE workspace_id = v_ws AND id = v_product;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.bump_product_rev_from_variant() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER product_variants_bump_rev
  AFTER INSERT OR UPDATE OR DELETE ON cf.product_variants
  FOR EACH ROW EXECUTE FUNCTION cf.bump_product_rev_from_variant();

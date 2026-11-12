SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- ===================================================================================================
-- KB-SHOP-V2 (PR3/5, lệnh chủ dự án 11/11/2026) — migration CHỈ-THÊM, chưa có code nào dùng (PR4–5 dùng).
--  * cf.shop_profiles thêm: slogan, industries text[], legal_name, tax_id, hours jsonb {open:{days,from,to}, support:{from,to}},
--    contacts jsonb {hotline, zalo, website, shopee, tiktok}, branches jsonb (mảng {name, address, hours?, note, is_main}, TỐI ĐA 10).
--    Cột mới đều NULL/DEFAULT nên ADD COLUMN không viết lại bảng. Mọi giá trị ≤ 500 ký tự (DB chặn tổng độ dài; Zod ở packages/shared chặn từng giá trị
--    và KHÔNG cho số tiền — giá chỉ đọc từ products). RLS/quyền hàng giữ nguyên (Owner hoặc hệ thống ghi, thành viên đọc); chỉ thêm GRANT UPDATE theo cột mới.
--  * Bảng MỚI cf.shop_profile_suggestions: đề xuất giá trị trường (từ Shopify hoặc đoạn văn thô) chờ Owner Áp dụng/Bỏ.
--    RLS: SELECT thành viên (hoặc không người dùng); INSERT Owner HOẶC hệ thống — hệ thống CHỈ chèn status='draft'; UPDATE/DELETE Owner, hoặc hệ thống chỉ trên
--    bản NHÁP (làm mới đề xuất). Trigger shop_profile_suggestions_guard: chỉ Owner đặt applied/rejected (42501), đóng dấu decided_by/decided_at do SERVER,
--    workspace_id/lang/field/source bất biến. Nguồn 'kb_text' bắt buộc có evidence_quote (CHECK). Mỗi (workspace, lang, field, source) tối đa MỘT bản nháp.
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng ở production.
-- Đường lùi: DROP TRIGGER shop_profile_suggestions_guard ON cf.shop_profile_suggestions; DROP FUNCTION cf.shop_profile_suggestions_guard();
--   DROP TABLE cf.shop_profile_suggestions; ALTER TABLE cf.shop_profiles DROP COLUMN slogan, DROP COLUMN industries, DROP COLUMN legal_name,
--   DROP COLUMN tax_id, DROP COLUMN hours, DROP COLUMN contacts, DROP COLUMN branches; (và bỏ kỳ vọng cf.shop_profile_suggestions ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "slogan" text;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "industries" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "legal_name" text;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "tax_id" text;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "hours" jsonb;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "contacts" jsonb;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD COLUMN "branches" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_slogan_check" CHECK ("cf"."shop_profiles"."slogan" IS NULL OR char_length("cf"."shop_profiles"."slogan") <= 500);
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_legal_name_check" CHECK ("cf"."shop_profiles"."legal_name" IS NULL OR char_length("cf"."shop_profiles"."legal_name") <= 500);
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_tax_id_check" CHECK ("cf"."shop_profiles"."tax_id" IS NULL OR char_length("cf"."shop_profiles"."tax_id") <= 500);
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_industries_check" CHECK (cardinality("cf"."shop_profiles"."industries") <= 10 AND char_length(array_to_string("cf"."shop_profiles"."industries", '|')) <= 500);
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_hours_check" CHECK ("cf"."shop_profiles"."hours" IS NULL OR (jsonb_typeof("cf"."shop_profiles"."hours") = 'object' AND char_length("cf"."shop_profiles"."hours"::text) <= 2000));
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_contacts_check" CHECK ("cf"."shop_profiles"."contacts" IS NULL OR (jsonb_typeof("cf"."shop_profiles"."contacts") = 'object' AND char_length("cf"."shop_profiles"."contacts"::text) <= 2500));
--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_branches_check" CHECK (jsonb_typeof("cf"."shop_profiles"."branches") = 'array' AND jsonb_array_length("cf"."shop_profiles"."branches") <= 10 AND char_length("cf"."shop_profiles"."branches"::text) <= 20000);
--> statement-breakpoint
GRANT UPDATE (slogan, industries, legal_name, tax_id, hours, contacts, branches) ON cf.shop_profiles TO cf_app;
--> statement-breakpoint
CREATE TABLE "cf"."shop_profile_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"evidence_quote" text,
	"source" text NOT NULL,
	"source_ref" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_profile_suggestions_lang_check" CHECK ("cf"."shop_profile_suggestions"."lang" IN ('vi', 'en', 'all')),
	CONSTRAINT "shop_profile_suggestions_field_check" CHECK ("cf"."shop_profile_suggestions"."field" IN ('name', 'slogan', 'description', 'address', 'opening_hours', 'legal_name', 'tax_id', 'hotline', 'email', 'website', 'zalo', 'shopee', 'tiktok')),
	CONSTRAINT "shop_profile_suggestions_value_check" CHECK (char_length("cf"."shop_profile_suggestions"."value") between 1 and 500),
	CONSTRAINT "shop_profile_suggestions_evidence_check" CHECK (("cf"."shop_profile_suggestions"."evidence_quote" IS NULL OR char_length("cf"."shop_profile_suggestions"."evidence_quote") between 1 and 500) AND ("cf"."shop_profile_suggestions"."source" <> 'kb_text' OR "cf"."shop_profile_suggestions"."evidence_quote" IS NOT NULL)),
	CONSTRAINT "shop_profile_suggestions_source_check" CHECK ("cf"."shop_profile_suggestions"."source" IN ('shopify', 'kb_text')),
	CONSTRAINT "shop_profile_suggestions_source_ref_check" CHECK ("cf"."shop_profile_suggestions"."source_ref" IS NULL OR char_length("cf"."shop_profile_suggestions"."source_ref") <= 500),
	CONSTRAINT "shop_profile_suggestions_status_check" CHECK ("cf"."shop_profile_suggestions"."status" IN ('draft', 'applied', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "cf"."shop_profile_suggestions" ADD CONSTRAINT "shop_profile_suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."shop_profile_suggestions" ADD CONSTRAINT "shop_profile_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_profile_suggestions_draft_unique" ON "cf"."shop_profile_suggestions" USING btree ("workspace_id","lang","field","source") WHERE "cf"."shop_profile_suggestions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "shop_profile_suggestions_workspace_status_idx" ON "cf"."shop_profile_suggestions" USING btree ("workspace_id","status","lang");
--> statement-breakpoint
ALTER TABLE cf.shop_profile_suggestions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.shop_profile_suggestions TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, lang, field, value, evidence_quote, source, source_ref, status) ON cf.shop_profile_suggestions TO cf_app;
--> statement-breakpoint
GRANT UPDATE (value, evidence_quote, source_ref, status) ON cf.shop_profile_suggestions TO cf_app;
--> statement-breakpoint
CREATE POLICY shop_profile_suggestions_select ON cf.shop_profile_suggestions FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY shop_profile_suggestions_insert ON cf.shop_profile_suggestions FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_workspace_owner())
      OR ((SELECT core.is_system_context()) AND status = 'draft')
    )
  );
--> statement-breakpoint
CREATE POLICY shop_profile_suggestions_update ON cf.shop_profile_suggestions FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR ((SELECT core.is_system_context()) AND status = 'draft'))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR ((SELECT core.is_system_context()) AND status = 'draft'))
  );
--> statement-breakpoint
CREATE POLICY shop_profile_suggestions_delete ON cf.shop_profile_suggestions FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR ((SELECT core.is_system_context()) AND status = 'draft'))
  );
--> statement-breakpoint
CREATE FUNCTION cf.shop_profile_suggestions_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id <> OLD.workspace_id OR NEW.lang <> OLD.lang OR NEW.field <> OLD.field OR NEW.source <> OLD.source THEN
      RAISE EXCEPTION 'shop_profile_suggestions: không được đổi workspace/lang/field/source' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status <> 'draft' THEN
    IF core.current_user_id() IS NULL OR NOT core.is_workspace_owner() THEN
      RAISE EXCEPTION 'shop_profile_suggestions: chỉ Owner được áp dụng hoặc bỏ đề xuất' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.decided_by := core.current_user_id();
      NEW.decided_at := now();
    ELSE
      NEW.decided_by := OLD.decided_by;
      NEW.decided_at := OLD.decided_at;
    END IF;
  ELSE
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER shop_profile_suggestions_guard BEFORE INSERT OR UPDATE ON cf.shop_profile_suggestions
  FOR EACH ROW EXECUTE FUNCTION cf.shop_profile_suggestions_guard();
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

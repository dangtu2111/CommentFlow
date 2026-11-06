SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."brand_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"tone" text,
	"greeting" text,
	"sign_off" text,
	"do" text[] DEFAULT '{}'::text[] NOT NULL,
	"dont" text[] DEFAULT '{}'::text[] NOT NULL,
	"address_by_name" boolean DEFAULT false NOT NULL,
	"shop_pronoun" text DEFAULT 'em' NOT NULL,
	"shop_pronoun_custom" text,
	"customer_address" text DEFAULT 'anh_chi' NOT NULL,
	"handoff_templates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_voice_workspace_lang_unique" UNIQUE("workspace_id","lang"),
	CONSTRAINT "brand_voice_lang_check" CHECK ("cf"."brand_voice"."lang" in ('vi', 'en')),
	CONSTRAINT "brand_voice_pronoun_check" CHECK ("cf"."brand_voice"."shop_pronoun" in ('em', 'shop', 'minh', 'custom')),
	CONSTRAINT "brand_voice_address_check" CHECK (("cf"."brand_voice"."lang" = 'vi' and "cf"."brand_voice"."customer_address" in ('anh_chi', 'ban', 'quy_khach')) or ("cf"."brand_voice"."lang" = 'en' and "cf"."brand_voice"."customer_address" = 'you')),
	CONSTRAINT "brand_voice_custom_check" CHECK (("cf"."brand_voice"."shop_pronoun" = 'custom' and char_length(btrim(coalesce("cf"."brand_voice"."shop_pronoun_custom", ''))) > 0) or ("cf"."brand_voice"."shop_pronoun" <> 'custom' and "cf"."brand_voice"."shop_pronoun_custom" is null))
);
--> statement-breakpoint
CREATE TABLE "cf"."faq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"lang" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faq_items_lang_check" CHECK ("cf"."faq_items"."lang" in ('vi', 'en', 'all')),
	CONSTRAINT "faq_items_answer_check" CHECK (char_length("cf"."faq_items"."answer") between 1 and 8000)
);
--> statement-breakpoint
CREATE TABLE "cf"."policy_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"lang" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_items_lang_check" CHECK ("cf"."policy_items"."lang" in ('vi', 'en', 'all')),
	CONSTRAINT "policy_items_kind_check" CHECK ("cf"."policy_items"."kind" in ('shipping', 'return', 'warranty', 'payment', 'other')),
	CONSTRAINT "policy_items_content_check" CHECK (char_length("cf"."policy_items"."content") between 1 and 8000)
);
--> statement-breakpoint
CREATE TABLE "cf"."shop_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"address" text,
	"opening_hours" text,
	"contact" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_profiles_workspace_lang_unique" UNIQUE("workspace_id","lang"),
	CONSTRAINT "shop_profiles_lang_check" CHECK ("cf"."shop_profiles"."lang" in ('vi', 'en', 'all'))
);
--> statement-breakpoint
ALTER TABLE "cf"."brand_voice" ADD CONSTRAINT "brand_voice_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD CONSTRAINT "faq_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."policy_items" ADD CONSTRAINT "policy_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."shop_profiles" ADD CONSTRAINT "shop_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faq_items_workspace_idx" ON "cf"."faq_items" USING btree ("workspace_id","lang");--> statement-breakpoint
CREATE INDEX "policy_items_workspace_idx" ON "cf"."policy_items" USING btree ("workspace_id","kind");
-- ===================================================================================================
-- Phần viết tay (feat-kb-shop-policy-faq, KB-SHOP-POLICY-FAQ, QKB2): RLS + quyền bảng/cột. Mẫu 0033 (kb_sources).
--  * Ba đường: người dùng (withActor), HỆ THỐNG (withJob → core.is_system_context()) và withWorkspace trần (chỉ ĐỌC).
--  * SELECT: workspace hiện tại VÀ (không có người dùng HOẶC thành viên đang hoạt động).
--  * INSERT/UPDATE/DELETE: Owner đang hoạt động HOẶC hệ thống (ít quyền nhất: giọng văn/quy tắc quyết định tự gửi).
--    Staff chỉ đọc; nới quyền bằng migration kế tiếp nếu chủ dự án muốn.
--  * DELETE chỉ cho faq_items, policy_items (mục nhập tay xóa thật được). shop_profiles, brand_voice: KHÔNG DELETE.
--  * UPDATE theo cột: không đổi workspace_id/id; shop_profiles, brand_voice, policy_items không đổi lang/kind (tạo mới).
--  * Mỗi lệnh đúng MỘT policy (không có policy permissive thứ hai mở lại quyền).
--
-- Đường lùi: DROP TABLE cf.shop_profiles, cf.policy_items, cf.faq_items, cf.brand_voice CASCADE (bảng mới, chưa có dữ
-- liệu thật). PHẢI lùi cả check-rls.ts (ACTOR_POLICIES, NO_DELETE_TABLES, cột cấm UPDATE) nếu không db:check-rls đỏ.
-- ===================================================================================================
--> statement-breakpoint
ALTER TABLE cf.shop_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.policy_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.faq_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.brand_voice ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON cf.shop_profiles, cf.policy_items, cf.faq_items, cf.brand_voice TO cf_app;
--> statement-breakpoint
GRANT DELETE ON cf.policy_items, cf.faq_items TO cf_app;
--> statement-breakpoint
GRANT UPDATE (name, description, address, opening_hours, contact, website, updated_at) ON cf.shop_profiles TO cf_app;
--> statement-breakpoint
GRANT UPDATE (title, content, updated_at) ON cf.policy_items TO cf_app;
--> statement-breakpoint
GRANT UPDATE (question, answer, lang, tags, updated_at) ON cf.faq_items TO cf_app;
--> statement-breakpoint
GRANT UPDATE (tone, greeting, sign_off, "do", dont, address_by_name, shop_pronoun, shop_pronoun_custom, customer_address,
  handoff_templates, updated_at) ON cf.brand_voice TO cf_app;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shop_profiles', 'policy_items', 'faq_items', 'brand_voice'] LOOP
    EXECUTE format($f$CREATE POLICY %1$I_select ON cf.%1$I FOR SELECT
      USING (
        workspace_id = (SELECT core.current_workspace_id())
        AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
      )$f$, t);
    EXECUTE format($f$CREATE POLICY %1$I_insert ON cf.%1$I FOR INSERT
      WITH CHECK (
        workspace_id = (SELECT core.current_workspace_id())
        AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
      )$f$, t);
    EXECUTE format($f$CREATE POLICY %1$I_update ON cf.%1$I FOR UPDATE
      USING (
        workspace_id = (SELECT core.current_workspace_id())
        AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
      )
      WITH CHECK (
        workspace_id = (SELECT core.current_workspace_id())
        AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
      )$f$, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['policy_items', 'faq_items'] LOOP
    EXECUTE format($f$CREATE POLICY %1$I_delete ON cf.%1$I FOR DELETE
      USING (
        workspace_id = (SELECT core.current_workspace_id())
        AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
      )$f$, t);
  END LOOP;
END $$;
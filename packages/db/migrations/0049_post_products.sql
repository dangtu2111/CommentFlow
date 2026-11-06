SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."post_products" (
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"suggested_by_ai" boolean DEFAULT false NOT NULL,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_products_pk" PRIMARY KEY("workspace_id","post_id","product_id"),
	CONSTRAINT "post_products_status_check" CHECK ("cf"."post_products"."status" IN ('suggested', 'confirmed')),
	CONSTRAINT "post_products_primary_check" CHECK (NOT "cf"."post_products"."is_primary" OR "cf"."post_products"."status" = 'confirmed'),
	CONSTRAINT "post_products_suggested_check" CHECK ("cf"."post_products"."status" <> 'suggested' OR "cf"."post_products"."suggested_by_ai")
);
--> statement-breakpoint
ALTER TABLE "cf"."post_products" ADD CONSTRAINT "post_products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."post_products" ADD CONSTRAINT "post_products_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."post_products" ADD CONSTRAINT "post_products_post_fk" FOREIGN KEY ("workspace_id","post_id") REFERENCES "cf"."posts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."post_products" ADD CONSTRAINT "post_products_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "cf"."products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_products_product_idx" ON "cf"."post_products" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_products_one_primary_idx" ON "cf"."post_products" USING btree ("workspace_id","post_id") WHERE "cf"."post_products"."is_primary";
--> statement-breakpoint
-- ===================================================================================================
-- POSTS-LINK-PRODUCT (FR-061, US-032, Q-PLP1) — feat-posts-link-product. Liên kết bài ↔ sản phẩm.
--
--  * status 'suggested' (AI/hệ thống đề xuất, CHƯA dùng để trả lời) | 'confirmed' (nhân viên xác nhận).
--    CHECK: suggested ⇒ suggested_by_ai; is_primary ⇒ confirmed. Chỉ mục duy nhất từng phần: tối đa một chính/bài.
--  * RLS SELECT: thành viên hoạt động (hoặc ngữ cảnh không người dùng: withWorkspace/withJob).
--    INSERT: (a) 'suggested' — thành viên hoặc hệ thống, confirmed_by NULL, suggested_by_ai, không chính;
--            (b) 'confirmed' — CHỈ thành viên là người dùng thật, confirmed_by = người đang ghi (không giả được);
--            hệ thống/AI không thể tự tạo liên kết đã xác nhận (AGENTS.md nguyên tắc 3 — AI chỉ đề xuất).
--            Kết nối cf_worker bị chặn cả khi giả người dùng bằng withActor (session_user, như 0030).
--            Không CHECK "confirmed ⇒ confirmed_by NOT NULL": FK SET NULL khi xóa người dùng sẽ vướng (như 0043); RLS INSERT giữ.
--    UPDATE: chỉ is_primary + updated_at, chỉ thành viên (không cf_worker). DELETE: thành viên (không cf_worker),
--            hệ thống chỉ gỡ được đề xuất (status = 'suggested').
--    Xác nhận một đề xuất = DELETE + INSERT 'confirmed' trong một giao dịch (không cấp UPDATE cho status/confirmed_by).
--  * Mỗi lệnh đúng MỘT policy permissive. Cột định danh không nằm trong GRANT UPDATE.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng trong pipeline nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.post_products; (và bỏ kỳ vọng ở check-rls.ts).
-- ===================================================================================================
ALTER TABLE cf.post_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.post_products TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, post_id, product_id, status, is_primary, suggested_by_ai, confirmed_by) ON cf.post_products TO cf_app;
--> statement-breakpoint
GRANT UPDATE (is_primary, updated_at) ON cf.post_products TO cf_app;
--> statement-breakpoint
CREATE POLICY post_products_select ON cf.post_products FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY post_products_insert ON cf.post_products FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (
        status = 'suggested' AND suggested_by_ai AND confirmed_by IS NULL AND NOT is_primary
        AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
      )
      OR (
        status = 'confirmed' AND confirmed_by IS NOT NULL
        AND confirmed_by = (SELECT core.current_user_id())
        AND (SELECT core.is_workspace_member())
        AND session_user <> 'cf_worker'
      )
    )
  );
--> statement-breakpoint
CREATE POLICY post_products_update ON cf.post_products FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_member())
    AND session_user <> 'cf_worker'
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_member())
    AND session_user <> 'cf_worker'
  );
--> statement-breakpoint
CREATE POLICY post_products_delete ON cf.post_products FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_member()) AND session_user <> 'cf_worker')
      OR ((SELECT core.is_system_context()) AND status = 'suggested')
    )
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
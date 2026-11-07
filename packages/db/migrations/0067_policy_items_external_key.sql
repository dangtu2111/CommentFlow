-- SHOPIFY-POLICIES (đồng bộ chính sách cửa hàng Shopify vào Cơ sở kiến thức): mục chính sách nạp từ nguồn ngoài mang `external_key`
-- (`shopify:<loại>`, ví dụ `shopify:refund_policy`) để lần đồng bộ sau CẬP NHẬT đúng mục đó và dọn mục đã biến mất, KHÔNG đụng tới
-- mục Owner nhập tay (external_key NULL). Duy nhất theo (workspace, external_key) khi có khóa.
-- Quyền: bảng đã có SELECT/INSERT/DELETE cho cf_app (0036; worker `cf_worker` kế thừa), UPDATE theo cột (title, content, updated_at)
-- đủ cho upsert; cột mới tự có SELECT/INSERT theo quyền bảng.
-- Đường lùi: DROP INDEX cf.policy_items_external_key_idx; ALTER TABLE cf.policy_items DROP COLUMN external_key (CHECK tự mất).
ALTER TABLE "cf"."policy_items" ADD COLUMN "external_key" text;
--> statement-breakpoint
ALTER TABLE "cf"."policy_items" ADD CONSTRAINT "policy_items_external_key_check" CHECK ("cf"."policy_items"."external_key" IS NULL OR "cf"."policy_items"."external_key" ~ '^shopify:[a-z0-9_]{1,60}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "policy_items_external_key_idx" ON "cf"."policy_items" USING btree ("workspace_id","external_key") WHERE "cf"."policy_items"."external_key" IS NOT NULL;

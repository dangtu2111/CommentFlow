-- KB-PRODUCT-IMAGE: ảnh đại diện sản phẩm từ nguồn ngoài (Shopify `featuredMedia`) — chỉ lưu URL trên CDN của nguồn, không tải ảnh về.
-- Chỉ chấp nhận http(s) (chặn `javascript:`/`data:`). Quyền: bảng `products` cấp theo CỘT (0034) nên phải cấp riêng cho cột mới.
-- Đường lùi: REVOKE INSERT (image_url), UPDATE (image_url) ON cf.products FROM cf_app; ALTER TABLE cf.products DROP COLUMN image_url (CHECK tự mất).
ALTER TABLE "cf"."products" ADD COLUMN "image_url" text;
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD CONSTRAINT "products_image_url_check" CHECK ("cf"."products"."image_url" IS NULL OR "cf"."products"."image_url" ~ '^https?://');
--> statement-breakpoint
GRANT INSERT (image_url) ON cf.products TO cf_app;
--> statement-breakpoint
GRANT UPDATE (image_url) ON cf.products TO cf_app;

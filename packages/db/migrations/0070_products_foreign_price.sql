-- SHOPIFY-FOREIGN-PRICE (Q-SFP1, thay Q-SNV1): cửa hàng nguồn dùng tiền tệ KHÁC VND thì giá được lưu theo ĐƠN VỊ NHỎ NHẤT của tiền tệ
-- gốc (USD: cent) kèm mã tiền tệ, KHÔNG quy đổi sang VND (nguyên tắc #4). Các cột `price_vnd`/`compare_at_vnd` GIỮ NGUYÊN ý nghĩa
-- "đồng" và để NULL cho hàng khác VND, nên mọi nơi đang đọc giá VND (giao diện, kiểm giá lúc gửi, quy tắc giá, bộ chặn số tiền) vẫn
-- thấy "chưa có giá VND" thay vì hiểu nhầm cent thành đồng. Chỉ đường trả lời của AI đọc các cột mới.
-- Chỉ THÊM cột có mặc định/cho NULL (không khóa bảng lâu, tương thích ngược). RLS không đổi (cột mới nằm trong bảng đã có chính sách).
-- Đường lùi: ALTER TABLE cf.products / cf.product_variants DROP COLUMN currency_code, price_minor, compare_at_minor (CHECK tự mất).
ALTER TABLE "cf"."products" ADD COLUMN "currency_code" text DEFAULT 'VND' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD COLUMN "price_minor" bigint;
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD COLUMN "compare_at_minor" bigint;
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD CONSTRAINT "products_currency_code_check" CHECK ("cf"."products"."currency_code" ~ '^[A-Z]{3}$');
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD CONSTRAINT "products_minor_price_check" CHECK (("cf"."products"."price_minor" IS NULL OR "cf"."products"."price_minor" >= 0) AND ("cf"."products"."compare_at_minor" IS NULL OR "cf"."products"."compare_at_minor" >= 0));
--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD COLUMN "currency_code" text DEFAULT 'VND' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD COLUMN "price_minor" bigint;
--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD COLUMN "compare_at_minor" bigint;
--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD CONSTRAINT "product_variants_currency_code_check" CHECK ("cf"."product_variants"."currency_code" ~ '^[A-Z]{3}$');
--> statement-breakpoint
ALTER TABLE "cf"."product_variants" ADD CONSTRAINT "product_variants_minor_price_check" CHECK (("cf"."product_variants"."price_minor" IS NULL OR "cf"."product_variants"."price_minor" >= 0) AND ("cf"."product_variants"."compare_at_minor" IS NULL OR "cf"."product_variants"."compare_at_minor" >= 0));

-- SHOPIFY-FOREIGN-PRICE (Q-SFP1): quyền cho các cột mới của 0070. `products` cấp theo CỘT (0034/0068) nên phải cấp riêng; `product_variants`
-- có INSERT ở mức bảng nhưng UPDATE theo cột. Chỉ cấp cho `cf_app` (cùng vai trò đang ghi đồng bộ), đúng các cột mới — không nới RLS, không cấp
-- quyền ở cột khác.
-- Đường lùi: REVOKE INSERT (currency_code, price_minor, compare_at_minor), UPDATE (currency_code, price_minor, compare_at_minor) ON cf.products FROM cf_app;
--            REVOKE UPDATE (currency_code, price_minor, compare_at_minor) ON cf.product_variants FROM cf_app;
GRANT INSERT (currency_code, price_minor, compare_at_minor) ON cf.products TO cf_app;
--> statement-breakpoint
GRANT UPDATE (currency_code, price_minor, compare_at_minor) ON cf.products TO cf_app;
--> statement-breakpoint
GRANT UPDATE (currency_code, price_minor, compare_at_minor) ON cf.product_variants TO cf_app;

-- ===================================================================================================
-- PIPE-ORCHESTRATOR lát F — Owner chỉnh trần câu AI cho mỗi khách dưới mỗi bài (FR-167, Q-POR14). CHỈ THÊM quyền theo cột.
--
-- Cột `cf.automation_settings.max_ai_replies_per_customer_post` (0076, 1–5, mặc định 3) cần được cf_app (web) ghi khi Owner chỉnh ở
-- Cài đặt › Tự động hóa. RLS KHÔNG đổi: chỉ Owner (hoặc hệ thống) ghi `automation_settings` (policy 0047); Staff chỉ đọc. DB giữ CHECK 1–5.
-- Chỉ cấp INSERT/UPDATE đúng MỘT cột này (không cấp UPDATE cả bảng).
-- Đường lùi: REVOKE INSERT (max_ai_replies_per_customer_post), UPDATE (max_ai_replies_per_customer_post) ON cf.automation_settings FROM cf_app;
-- ===================================================================================================
GRANT INSERT (max_ai_replies_per_customer_post) ON cf.automation_settings TO cf_app;
--> statement-breakpoint
GRANT UPDATE (max_ai_replies_per_customer_post) ON cf.automation_settings TO cf_app;

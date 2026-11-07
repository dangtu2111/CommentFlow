-- ===================================================================================================
-- FR-167 / Q-POR14 — trần trả lời của AI theo (khách, bài) trong 24 giờ (chủ dự án chốt 07/11). CHỈ THÊM (cột có mặc định, ràng buộc, chỉ mục).
--
--  * automation_settings.max_ai_replies_per_customer_post: số câu AI tối đa cho MỘT khách dưới MỘT bài trong 24 giờ (cửa sổ cố định
--    ở mã); 1–5, mặc định 3. Dòng cũ nhận mặc định 3. UI Owner chỉnh 1–5 là việc sau (cấp UPDATE theo cột khi làm); RLS không đổi.
--  * comments_customer_post_idx (workspace_id, post_id, author_external_id): đếm câu AI của (khách, bài) — cùng drafts_target_idx
--    (workspace, target_type, target_id, created_at) có sẵn; không quét toàn bảng khi bài có nhiều khách.
-- Ghi nhận: CREATE INDEX không CONCURRENTLY (như 0026/0031/0075; bảng còn nhỏ).
-- Đường lùi: DROP INDEX cf.comments_customer_post_idx; ALTER TABLE cf.automation_settings DROP COLUMN max_ai_replies_per_customer_post;
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD COLUMN "max_ai_replies_per_customer_post" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD CONSTRAINT "automation_settings_reply_cap_check" CHECK ("cf"."automation_settings"."max_ai_replies_per_customer_post" BETWEEN 1 AND 5);
--> statement-breakpoint
CREATE INDEX "comments_customer_post_idx" ON "cf"."comments" USING btree ("workspace_id", "post_id", "author_external_id");
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

-- PIPE-ORCHESTRATOR lát B (docs/plans/feat-pipe-orchestrator.md; Q-POR1, Q-POR2): dữ liệu cấu hình/nguồn để job `pipeline` đọc.
--  * automation_settings.merge_window_seconds: cửa sổ gộp bình luận liên tiếp cùng khách cùng bài (FR-148), 10–60 giây, mặc định 30.
--  * automation_settings.human_hold_minutes: sau khi nhân viên trả lời trong một chuỗi, AI chỉ gợi ý trong N phút (FR-154), mặc định 120,
--    0 = Owner tắt.
--  * comments.ingest_source: nguồn của bình luận (`webhook` | `polling` | `backfill`). Bình luận nhập ngược khi kết nối (FR-011) KHÔNG tự chạy
--    pipeline; lưu nguồn để job quét phân biệt chúng với bình luận kẹt. **Bình luận CÓ SẴN trước migration = `backfill`** (không tự chạy AI
--    khi bật PIPELINE_ENABLED — tránh xử lý hàng loạt dữ liệu cũ). Cột KHÔNG có mặc định lâu dài: thêm với DEFAULT 'backfill' (đổi
--    metadata, không viết lại bảng) rồi DROP DEFAULT, nên mọi dòng MỚI bắt buộc ghi nguồn rõ ràng (`ingest` ghi từ payload.source).
-- Chỉ THÊM cột có mặc định (không khóa bảng lâu, tương thích ngược). Quyền: `automation_settings` đã SELECT ở mức bảng cho cf_app (0047),
-- `comments` đã INSERT ở mức bảng (0019) và `ingest_source` do hệ thống chỉ ghi lúc tạo (không cấp UPDATE); UI sửa 2 cột cấu hình là việc
-- sau (cấp UPDATE theo cột khi làm). RLS không đổi.
-- Đường lùi: ALTER TABLE cf.automation_settings DROP COLUMN merge_window_seconds, DROP COLUMN human_hold_minutes;
--            ALTER TABLE cf.comments DROP COLUMN ingest_source; (CHECK tự mất).
ALTER TABLE "cf"."automation_settings" ADD COLUMN "merge_window_seconds" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD COLUMN "human_hold_minutes" integer DEFAULT 120 NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD CONSTRAINT "automation_settings_merge_window_check" CHECK ("cf"."automation_settings"."merge_window_seconds" BETWEEN 10 AND 60);
--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD CONSTRAINT "automation_settings_human_hold_check" CHECK ("cf"."automation_settings"."human_hold_minutes" >= 0);
--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD COLUMN "ingest_source" text DEFAULT 'backfill' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."comments" ALTER COLUMN "ingest_source" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_ingest_source_check" CHECK ("cf"."comments"."ingest_source" IN ('webhook', 'polling', 'backfill'));

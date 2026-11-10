SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- ===================================================================================================
-- KB-DISTILL (lệnh tổng 10/11/2026, M3 giai đoạn 1+2) — migration CHỈ-THÊM CỘT, chưa có code nào dùng cột mới.
--  * cf.kb_gaps.fact_topic (text, null): chủ đề MỊN của sự kiện (mã FactTopic) để duyệt thẻ đóng gap CHÍNH XÁC thay cho M2b.
--    null = chưa rõ / gap gộp nhiều chủ đề → không tự đóng. KHÔNG đổi khóa duy nhất kb_gaps_key_unique (giữ ON CONFLICT cũ → tương thích bản worker cũ/mới).
--    Chỉ job hệ thống được ghi cột này: thêm vào trigger kb_gaps_guard_update (thành viên không đổi được).
--  * cf.faq_items.status ('published' mặc định | 'draft'), kind ('faq' mặc định | 'product_attr'), evidence_quote, source_chunk_id:
--    mục do máy CHẮT LỌC từ đoạn thô nằm ở 'draft' (chưa vào tìm kiếm) tới khi Owner duyệt. Mọi dòng hiện có = 'published'/'faq' (đồng bộ cũ không đổi hành vi).
--    Owner được UPDATE status (duyệt); INSERT vẫn theo policy cũ (Owner hoặc hệ thống). source_chunk_id không có khóa ngoại: đoạn bản nháp bị ghi lại khi đồng bộ.
--  * Không DROP/RENAME/đổi kiểu, không nới RLS. Cột có DEFAULT/NULL nên ADD COLUMN không viết lại bảng.
-- TRIỂN KHAI: migrate trước; code đọc/ghi cột mới ở PR sau.
-- Đường lùi: ALTER TABLE cf.faq_items DROP COLUMN status, DROP COLUMN kind, DROP COLUMN evidence_quote, DROP COLUMN source_chunk_id;
--   ALTER TABLE cf.kb_gaps DROP COLUMN fact_topic; khôi phục cf.kb_gaps_guard_update() bản 0040; thu hồi GRANT cột mới.
-- ===================================================================================================
ALTER TABLE "cf"."kb_gaps" ADD COLUMN "fact_topic" text;
--> statement-breakpoint
ALTER TABLE "cf"."kb_gaps" ADD CONSTRAINT "kb_gaps_fact_topic_check" CHECK ("cf"."kb_gaps"."fact_topic" IS NULL OR char_length("cf"."kb_gaps"."fact_topic") BETWEEN 1 AND 40);
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD COLUMN "kind" text DEFAULT 'faq' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD COLUMN "evidence_quote" text;
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD COLUMN "source_chunk_id" uuid;
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD CONSTRAINT "faq_items_status_check" CHECK ("cf"."faq_items"."status" in ('published', 'draft'));
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD CONSTRAINT "faq_items_kind_check" CHECK ("cf"."faq_items"."kind" in ('faq', 'product_attr'));
--> statement-breakpoint
ALTER TABLE "cf"."faq_items" ADD CONSTRAINT "faq_items_evidence_check" CHECK ("cf"."faq_items"."evidence_quote" is null or char_length("cf"."faq_items"."evidence_quote") between 1 and 2000);
--> statement-breakpoint
GRANT INSERT (fact_topic) ON cf.kb_gaps TO cf_app;
--> statement-breakpoint
GRANT UPDATE (fact_topic) ON cf.kb_gaps TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status) ON cf.faq_items TO cf_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cf.kb_gaps_guard_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Thành viên chỉ đổi trạng thái; cột đếm/mẫu câu hỏi/chủ đề mịn chỉ job hệ thống ghi (fail-closed với NULL).
  IF core.is_system_context() IS NOT TRUE
     AND (NEW.count IS DISTINCT FROM OLD.count
          OR NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at
          OR NEW.sample_question_masked IS DISTINCT FROM OLD.sample_question_masked
          OR NEW.fact_topic IS DISTINCT FROM OLD.fact_topic) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Nháp chắt lọc chỉ Owner duyệt: job hệ thống không đưa 'draft' → 'published', và dòng có evidence_quote (do chắt lọc) do hệ thống ghi phải là 'draft'.
CREATE OR REPLACE FUNCTION cf.faq_items_guard_publish() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.is_system_context() IS TRUE THEN
    IF TG_OP = 'INSERT' AND NEW.evidence_quote IS NOT NULL AND NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'published' THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER faq_items_guard_publish BEFORE INSERT OR UPDATE ON cf.faq_items FOR EACH ROW EXECUTE FUNCTION cf.faq_items_guard_publish();

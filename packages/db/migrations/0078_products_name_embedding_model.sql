-- ===================================================================================================
-- EMBED-MODEL-MISMATCH-GUARD (chủ dự án chốt 08/11/2026) — ghi MODEL đã tạo `products.name_embedding`. CHỈ THÊM (cột NULL được).
--
-- `kb_chunks` đã có `embedding_model`; vector tên sản phẩm thì chưa nên không biết vector do model nào tạo → không chặn được trộn khác model.
-- Cột mới `name_embedding_model`: ghi cùng lúc với `name_embedding` (`setProductNameEmbedding`); nhánh vector tìm sản phẩm chỉ so vector cùng model.
-- Vector cũ (đã có trước cột này) có model NULL = "không rõ" → kiểm lệch coi là lệch, nhánh vector tắt cho tới khi tạo lại. Không backfill (không đoán).
-- cf_app được UPDATE cột này (như name_embedding, 0038); RLS không đổi.
-- Đường lùi: REVOKE UPDATE (name_embedding_model) ON cf.products FROM cf_app; ALTER TABLE cf.products DROP COLUMN name_embedding_model;
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD COLUMN "name_embedding_model" text;
--> statement-breakpoint
GRANT UPDATE (name_embedding_model) ON cf.products TO cf_app;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

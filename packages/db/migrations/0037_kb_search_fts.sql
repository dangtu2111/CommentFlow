SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'
                 AND string_to_array(extversion, '.')::int[] >= ARRAY[0,7]) THEN
    RAISE EXCEPTION 'KB-SEARCH-FTS cần extension vector >= 0.7 (halfvec); tạo ở bước khởi tạo DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    RAISE EXCEPTION 'KB-SEARCH-FTS cần extension pg_trgm; tạo ở bước khởi tạo DB';
  END IF;
  -- Trigger gọi cứng public.unaccent: phải gọi được thật (extension nằm schema public).
  IF public.unaccent('Đ') <> 'D' THEN
    RAISE EXCEPTION 'KB-SEARCH-FTS: public.unaccent không bỏ dấu đ như mong đợi';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "cf"."kb_chunks" ADD COLUMN "search_norm" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cf"."products" ADD COLUMN "name_embedding" halfvec(1024);
--> statement-breakpoint
-- ===================================================================================================
-- KB-SEARCH-FTS (FR-057, FR-127, FR-135) — feat-kb-search-fts, QKS1–QKS5. Phần viết tay.
--
--  * Trigger cf.kb_chunks_fill_search (BEFORE INSERT/UPDATE trên content, context_header, lang, tsv, search_norm):
--    đặt search_norm = lower(unaccent(context_header + content)) và tsv = to_tsvector(simple|english, search_norm)
--    theo lang ('en' → english, còn lại → simple). Giá trị worker truyền vào cho hai cột này bị GHI ĐÈ (một nơi tính duy
--    nhất; unaccent không IMMUTABLE nên không dùng cột generated). Trigger chạy bằng quyền người gọi, chỉ sửa NEW:
--    không cần và không mở thêm quyền cột nào trên kb_chunks (vẫn chỉ hệ thống ghi).
--  * products.name_embedding: cf_app được UPDATE cột này (policy products_update sẵn có: thành viên hoặc hệ thống).
--    Trigger products_set_rev không tăng rev khi chỉ đổi name_embedding (chỉ giá/tồn/trạng thái/biến thể).
--  * KHÔNG có HNSW (verifier-db): products và kb_chunks quét chính xác trong phạm vi workspace; thêm HNSW sau khi đo
--    (cần pgvector >= 0.8 + hnsw.iterative_scan). HNSW của kb_chunks.embedding: KB-EMBED-COL.
--  * Chỉ mục GIN tạo không CONCURRENTLY (runner chạy một giao dịch; bảng chưa có dữ liệu thật).
--
-- Đường lùi: DROP TRIGGER kb_chunks_fill_search ON cf.kb_chunks; DROP FUNCTION cf.kb_chunks_fill_search();
-- DROP INDEX cf.kb_chunks_search_norm_trgm_idx, cf.products_search_text_trgm_idx;
-- ALTER TABLE cf.kb_chunks DROP COLUMN search_norm; ALTER TABLE cf.products DROP COLUMN name_embedding;
-- (cột bị xóa thì quyền cột tự mất). Chỉ mất dữ liệu dẫn xuất.
-- ===================================================================================================
--> statement-breakpoint
CREATE FUNCTION cf.kb_chunks_fill_search() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.search_norm := lower(public.unaccent(concat_ws(' ', NEW.context_header, NEW.content)));
  NEW.tsv := to_tsvector(
    CASE NEW.lang WHEN 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END,
    NEW.search_norm
  );
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.kb_chunks_fill_search() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER kb_chunks_fill_search
  BEFORE INSERT OR UPDATE OF content, context_header, lang, tsv, search_norm ON cf.kb_chunks
  FOR EACH ROW EXECUTE FUNCTION cf.kb_chunks_fill_search();
--> statement-breakpoint
UPDATE cf.kb_chunks SET content = content;
--> statement-breakpoint
CREATE INDEX "kb_chunks_search_norm_trgm_idx" ON "cf"."kb_chunks" USING gin ("search_norm" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "products_search_text_trgm_idx" ON "cf"."products" USING gin ("search_text" gin_trgm_ops);
--> statement-breakpoint
GRANT UPDATE (name_embedding) ON cf.products TO cf_app;

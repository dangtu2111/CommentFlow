SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
  -- hnsw.iterative_scan (truy vấn lọc workspace sau khi quét chỉ mục) cần pgvector >= 0.8.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'
                 AND string_to_array(extversion, '.')::int[] >= ARRAY[0,8]) THEN
    RAISE EXCEPTION 'KB-EMBED-COL cần extension vector >= 0.8 (hnsw.iterative_scan); nâng ở bước khởi tạo DB';
  END IF;
END $$;
--> statement-breakpoint
-- KB-EMBED-COL (FR-133, FR-139). Cột embedding halfvec(1024) và embedding_model đã có từ 0033; migration này chỉ thêm chỉ mục.
--  * HNSW một phần: đúng tập đoạn mà searchKbChunks lọc (đã xuất bản, có vector, không nghi cài lệnh). Truy vấn lọc workspace/
--    phiên bản/ngôn ngữ sau khi quét → searchKbChunks bật hnsw.iterative_scan (strict_order) để không trả thiếu.
--  * B-tree (workspace_id, embedding_model): job tạo lại embedding (GĐ5) tìm đoạn theo mô hình. Không đổi dữ liệu/RLS/quyền.
--  * Bảng còn nhỏ nên CREATE INDEX thường (khóa ghi ngắn); khi lớn, tạo CONCURRENTLY ngoài migration.
-- Lùi: DROP INDEX cf.kb_chunks_embedding_hnsw_idx, cf.kb_chunks_workspace_embedding_model_idx;
CREATE INDEX "kb_chunks_embedding_hnsw_idx" ON "cf"."kb_chunks" USING hnsw ("embedding" halfvec_cosine_ops) WITH (m=16,ef_construction=64) WHERE "cf"."kb_chunks"."embedding" is not null and not "cf"."kb_chunks"."is_draft" and not "cf"."kb_chunks"."injection_suspected";--> statement-breakpoint
CREATE INDEX "kb_chunks_workspace_embedding_model_idx" ON "cf"."kb_chunks" USING btree ("workspace_id","embedding_model");

# Handoff `feat-kb-embed-col` (KB-EMBED-COL) — agent: claude

## Đã làm
- Migration `0041_kb_embed_col.sql`: HNSW một phần `kb_chunks_embedding_hnsw_idx` (`halfvec_cosine_ops`, m=16, ef_construction=64, WHERE embedding IS NOT NULL AND NOT is_draft AND NOT injection_suspected) + B-tree `kb_chunks_workspace_embedding_model_idx`; chặn nếu pgvector < 0.8.
- `searchKbChunks`: `set_config('hnsw.iterative_scan','strict_order',true)` khi có `queryVector`.
- Test tích hợp `packages/db/tests/kb-embed-col.int.test.ts` (chạy ở CI; làn không có DB).
- Q-KEC1, docs/10, gap-matrix, MASTER, codemap, KIEM_TRA_TAY, CAN_BAN_CUNG_CAP.

## Đã đọc + rút ra
- Cột `embedding`/`embedding_model` đã có từ 0033; 0038 hoãn HNSW cho việc này (QKS5). pgvector CI/dev = 0.8.7.
- Vector branch lọc `NOT is_draft AND NOT injection_suspected AND embedding IS NOT NULL` → khớp predicate chỉ mục.

## Còn lại
- Job tạo lại embedding khi đổi mô hình → GĐ5. HNSW `products.name_embedding` chưa (đo trước).
- `PGVECTOR-HYBRID` dùng chỉ mục này; kiểm lại EXPLAIN khi đổi truy vấn vector.

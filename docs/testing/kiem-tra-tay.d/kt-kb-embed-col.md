## KT-KB-EMBED-COL — Chỉ mục embedding của `kb_chunks` (KB-EMBED-COL, FR-133/139, migration 0042) · Embedding indexes

Chưa có giao diện; kiểm trên DB thử (`cf_dev`/`cf_test`). / No UI; verify on a test DB.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm db:migrate` (cf_dev, pgvector >= 0.8). | Áp 0042 không lỗi; DB cũ hơn 0.8 báo "cần extension vector >= 0.8". |
| 2 | `\d cf.kb_chunks` trong psql. | Có `kb_chunks_embedding_hnsw_idx` (hnsw, một phần) và `kb_chunks_workspace_embedding_model_idx`. |
| 3 | `CF_LANE=b pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/kb-embed-col.int.test.ts`. | 4 test xanh (gồm: workspace A vẫn nhận đủ 5 đoạn dù B có 120 đoạn gần hơn). |

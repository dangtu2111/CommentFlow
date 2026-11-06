## pgvector >= 0.8 cho chỉ mục HNSW — `KB-EMBED-COL`

Không cần khóa/tài khoản. Máy ảo `cf`, CI và staging/production phải dùng PostgreSQL 16 + pgvector >= 0.8 (hiện `pgvector/pgvector:0.8.7-pg16`). Migration 0042 báo lỗi rõ nếu thấp hơn. Chủ dự án chỉ cần nâng image khi dựng staging/production mới.

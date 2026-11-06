# Handoff feat-pgvector-hybrid (claude)

**Đã làm:** job `kb-reembed` (shared schema → db queries → ai `reembedWorkspaceChunks` → worker handler, cờ `KB_REEMBED_ENABLED` TẮT, embedder mock); `searchKbChunks` nhận `embeddingModel` (retrieve/Thử AI truyền `embedder.model`); test int độ chính xác lai + re-embed. Không migration (Q-PVH1).

**Đã đọc + rút ra:** tìm lai RRF/HNSW đã có (0038/0042); `kb_chunks` UPDATE chỉ hệ thống, cột `embedding`/`embedding_model` có GRANT; `workspaceJob` bọc `withJob`.

**Còn lại:** embedder LiteLLM thật + tự phát job khi đổi mô hình (`KB-EMBED-LITELLM`); HNSW `products.name_embedding` (đo trước).

Lưu ý: tiền tố `CF_LANE=b` bị chặn quyền trong phiên này nên `test:db` chạy không có tiền tố (cấu hình mặc định).

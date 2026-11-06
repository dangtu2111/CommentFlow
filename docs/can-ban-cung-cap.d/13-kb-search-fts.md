## 2g. Mô hình embedding (vector hóa) — `KB-SEARCH-FTS` (FR-057/127/139, Xong-mock, mã KT-KB-SEARCH)

Tìm kiếm toàn văn + trigram chạy hoàn toàn trong Postgres (không cần khóa). Nhánh **vector** nhận vector dựng sẵn qua interface `Embedder` (`packages/ai/src/embedding/`); hiện chỉ có bản fixture (băm ký tự, không gọi mạng), chưa có bản gọi mô hình thật. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Một model embedding **1024 chiều** trong LiteLLM (ví dụ dòng BGE-M3/multilingual-e5-large, hoặc dịch vụ trả phí hỗ trợ giảm chiều về 1024) + khóa ảo LiteLLM (`LITELLM_API_KEY`) có quyền model đó; tên model dự kiến đặt ở `EMBEDDING_MODEL` (chưa thêm vào `env.example` cho tới khi có bản thật).
- Quyết định có tự host (máy ảo) hay dùng dịch vụ trả phí; kèm giá để đưa vào `ai_usage`.

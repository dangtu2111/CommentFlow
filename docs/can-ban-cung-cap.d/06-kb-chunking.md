## 2f. Mô hình embedding thật — `KB-CHUNKING` (Xong-mock)

Lập chỉ mục kiến thức hiện dùng bản mock xác định (`createMockEmbedder`, `packages/ai/src/kb-indexing.ts`), không gọi dịch vụ ngoài. Để dùng embedding thật bạn cần cung cấp: mô hình embedding 1024 chiều đăng ký trong LiteLLM (tên + revision, ghi vào `kb_chunks.embedding_model`) và khóa ảo LiteLLM đã có (`LITELLM_BASE_URL`/khóa ảo của AI-WRAPPER). Việc cắm bản thật (kèm ghi `ai_usage`) là `KB-EMBED-LITELLM`, mặc định tắt cho tới khi có mô hình.

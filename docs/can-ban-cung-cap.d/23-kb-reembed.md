## Mô hình embedding thật để tạo lại vector — `PGVECTOR-HYBRID` / `KB-EMBED-LITELLM`

Job tạo lại embedding (`kb-reembed`, cờ `KB_REEMBED_ENABLED`, mặc định TẮT) hiện chỉ chạy với embedder **mock**. Cần chủ dự án cung cấp khi có: khóa/URL LiteLLM (hoặc nhà cung cấp embedding) + tên mô hình 1024 chiều. Chưa có thì giữ cờ TẮT ở staging/production. Không cần làm gì ở DB (không migration).

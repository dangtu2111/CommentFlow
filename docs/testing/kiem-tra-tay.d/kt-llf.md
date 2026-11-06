## KT-LLF — LiteLLM nhiều nhà cung cấp + trace Langfuse (LITELLM-LANGFUSE, feat-litellm-langfuse) — chỉ làm được khi đã có khóa thật và đã nối vào pipeline

> Hiện chỉ có mã + mock (chưa nối pipeline). Kiểm tự động đã phủ: `pnpm --filter @flow/ai test:coverage`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Trên máy ảo thử, gộp `multi-provider.example.yaml` vào `config.yaml`, đặt khóa nhà cung cấp, khởi động lại LiteLLM | LiteLLM chạy, liệt kê các nhóm `cf-classify`, `cf-draft`, `cf-embed` |
| 2 | Bật `LITELLM_MULTI_PROVIDER_ENABLED=true` ở môi trường THỬ; chạy một bình luận mẫu | Bước soạn dùng nhóm `cf-draft`; `ai_usage` ghi đúng model |
| 3 | Tạm làm khóa nhà cung cấp chính hỏng | Lần gọi vẫn thành công qua nhóm dự phòng |
| 4 | Bật `LANGFUSE_ENABLED=true`, gửi bình luận chứa SĐT và email THỬ | Trace xuất hiện trong Langfuse; SĐT/email hiện `[sđt]`/`[email]`, không còn bản gốc |
| 5 | Tắt Langfuse (sai khóa) rồi gửi bình luận | Bình luận vẫn xử lý bình thường; chỉ log mã lỗi, không log nội dung |
| 6 | Dùng khóa ảo có `max_budget` rất nhỏ | Sau khi vượt, LiteLLM từ chối gọi; app báo hết ngân sách |

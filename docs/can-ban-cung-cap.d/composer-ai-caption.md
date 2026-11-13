## COMPOSER-AI-CAPTION — Bật AI gợi ý caption/hashtag trong Biên tập bài viết (chủ dự án)

- **Mặc định TẮT.** Cần LiteLLM chạy (`LITELLM_BASE_URL`, `LITELLM_API_KEY` đã có cho các bước AI khác) và đặt **`CAPTION_LLM_MODEL`** (tên model trong LiteLLM, không có mặc định) trong `.env.local` của web rồi khởi động lại web.
- Bật cờ **`cf.ai.caption`** cho từng workspace (cờ DB, như các cờ `cf.ai.*` khác). Mỗi lần bấm là một lệnh gọi LLM tính phí, ghi ở `ai_usage` (bước `caption`, `hashtags`); giao diện giới hạn tốc độ.
- Thiếu một trong ba thứ trên thì nút bị khóa kèm lý do rõ ràng, không có bản giả.
- AI chỉ gợi ý; Owner đọc/sửa rồi tự đăng. Caption chứa số/giá/liên kết mà Owner không viết sẽ bị từ chối.

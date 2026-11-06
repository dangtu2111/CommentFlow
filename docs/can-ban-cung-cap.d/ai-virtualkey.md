## AI-VIRTUALKEY — Khóa ảo LiteLLM theo workspace (FR-034)

**Trạng thái:** Xong-mock (cờ `LITELLM_VIRTUAL_KEYS_ENABLED` mặc định TẮT; chưa nối nơi dựng client).

Bạn cần cung cấp:
1. **Master key LiteLLM** của proxy staging/production (biến `LITELLM_MASTER_KEY`, chỉ trên máy chạy thật; không dán vào chat/issue/commit). Chỉ dùng để cấp/sửa/thu hồi khóa ảo.
2. **Ngân sách mặc định** `LITELLM_VIRTUAL_KEY_DEFAULT_BUDGET_USD` (USD/tháng) cho workspace chưa đặt trần chi phí AI.
3. Đồng ý cho chạy migration lưu khóa ảo (mã hóa) — việc `AI-VIRTUALKEY-DB` ở làn b — trước khi bật cờ ở staging.

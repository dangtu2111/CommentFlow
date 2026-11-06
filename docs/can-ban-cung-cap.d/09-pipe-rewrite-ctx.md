## 2i. Khóa LLM trả phí cho viết lại câu hỏi — `PIPE-REWRITE-CTX` (FR-137/144, Xong-mock, mã KT-034)

Code đã có bước `rewrite` (`packages/ai/src/rewrite/`): phần ghép `search_query` và chọn ngữ cảnh là quy tắc thuần (không cần gì); chỉ nhánh LLM rẻ (câu ≤ 6 từ/mơ hồ, chưa nhận được sản phẩm) cần khóa, cờ **tắt mặc định**, chưa nối pipeline; test chạy bằng fixture/giả lập. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Khóa ảo LiteLLM (`LITELLM_API_KEY`) được cấp quyền cho **model rẻ** (có thể dùng chung model phân loại).
- Đặt `REWRITE_LLM_MODEL=<tên model trong LiteLLM>` và `REWRITE_LLM_ENABLED=true` (chỉ staging/thử).

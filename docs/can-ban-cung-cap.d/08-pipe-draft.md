## 2f. Khóa LLM trả phí cho soạn trả lời — `PIPE-DRAFT` (FR-029/138/140/142, Xong-mock, mã KT-031)

Code đã có bước `draft` (`packages/ai/src/draft/`) gọi LLM qua LiteLLM sẵn có (prompt xếp ổn định + đánh dấu cache), nhưng cờ **tắt mặc định** và chưa nối vào pipeline; test chạy bằng fixture/giả lập. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Khóa ảo LiteLLM (`LITELLM_API_KEY`) được cấp quyền cho **model soạn câu** (nên là model hỗ trợ prompt caching, ví dụ dòng Claude/GPT/Gemini); khóa nhà cung cấp đặt trong cấu hình LiteLLM trên máy ảo, không vào repo.
- Đặt `DRAFT_LLM_MODEL=<tên model trong LiteLLM>` và bật cờ DB `cf.ai.draft` (`pnpm flags:set -- cf.ai.draft on`) (chỉ staging/thử; chưa đo chất lượng và tỉ lệ trúng cache — chờ `EVAL-RUNNER`).
- `PIPE-VARIATION` (FR-161, mã KT-PV) dùng chung đúng khóa/model này (3–5 biến thể câu trong cùng một lần gọi, không thêm tài nguyên); chất lượng đa dạng thật chỉ đo được khi bật thật.

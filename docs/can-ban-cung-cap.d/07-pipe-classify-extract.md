## 2e. Khóa LLM trả phí cho phân loại + tách thông tin — `PIPE-CLASSIFY-EXTRACT` (FR-027/145/162, Xong-mock, mã KT-030)

Code đã có bước `extract` (`packages/ai/src/classify/`) gọi LLM qua LiteLLM sẵn có, nhưng cờ **tắt mặc định** và chưa nối vào pipeline; test chạy bằng fixture. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Khóa ảo LiteLLM (`LITELLM_API_KEY`, đã có trong `env.example`) được cấp quyền cho **một model nhỏ, rẻ** của nhà cung cấp trả phí (khóa nhà cung cấp đặt trong cấu hình LiteLLM trên máy ảo, không vào repo).
- Đặt `CLASSIFY_LLM_MODEL=<tên model trong LiteLLM>` và bật cờ DB `cf.ai.classify` (`pnpm flags:set -- cf.ai.classify on`) (chỉ staging/thử; chưa có đo chất lượng — chờ `EVAL-RUNNER`).

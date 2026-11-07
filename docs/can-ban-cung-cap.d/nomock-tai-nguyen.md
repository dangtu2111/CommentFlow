## NOMOCK — Tài nguyên thật thay cho mọi bản giả khi chạy (rà soát 08/11/2026)

**Vì sao cần:** ứng dụng không còn chạy bản giả; tính năng thiếu dịch vụ thật bị TẮT kèm thông báo tới khi anh cung cấp. Chi tiết: `docs/decisions/khong-mock-khi-chay-2026-11-08.md`.

| Việc | Anh cần cung cấp | Tính năng tắt tới khi có | Gap |
|---|---|---|---|
| Embedding bge-m3 (đã có ở dev) | Giữ `ML_EMBED_ENABLED=true`, `ML_URL` (và `ML_API_TOKEN` nếu có) ở `.env.local`/staging/production | Nhánh vector tìm kiếm | `NO-MOCK-RUNTIME-FOUNDATION`, `EMBED-MODEL-MISMATCH-GUARD` |
| LLM qua LiteLLM (đã có ở dev) | `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `CLASSIFY_LLM_ENABLED`, `DRAFT_LLM_ENABLED` (+ rewrite) | Ô Thử AI, bộ câu kiểm thử, job `pipeline` | `NOMOCK-01-TRYAI-LLM`, `NOMOCK-02-KB-TESTSET` |
| Nhà cung cấp SMS (OTP) | Chọn nhà cung cấp (eSMS/SpeedSMS/Twilio…), brandname, khóa API | Xác minh số điện thoại | `NOMOCK-04-SMS` |
| Kho ảnh đại diện | Cloudflare R2/S3: bucket, khóa, tên miền công khai | Tải ảnh đại diện | `NOMOCK-05-AVATAR` |
| Master key LiteLLM (khi bật khóa ảo theo workspace) | `LITELLM_MASTER_KEY` | Ngân sách riêng theo workspace | `NOMOCK-08-GUARD-ALL-MOCKS` |
| Quyết định giữ/bỏ dữ liệu mẫu `[MẪU]` ở giao diện dev | Chỉ cần trả lời | — | `NOMOCK-07-SAMPLE-DATA-UI` |

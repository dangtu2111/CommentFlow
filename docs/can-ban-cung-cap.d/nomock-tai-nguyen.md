## NOMOCK — Tài nguyên thật thay cho mọi bản giả khi chạy (rà soát 08/11/2026)

**Vì sao cần:** ứng dụng không còn chạy bản giả; tính năng thiếu dịch vụ thật bị TẮT kèm thông báo tới khi anh cung cấp. Chi tiết: `docs/decisions/khong-mock-khi-chay-2026-11-08.md`.

| Việc | Anh cần cung cấp | Tính năng tắt tới khi có | Gap |
|---|---|---|---|
| Embedding bge-m3 (đã có ở dev) | Giữ `ML_EMBED_ENABLED=true`, `ML_URL` (và `ML_API_TOKEN` nếu có) ở `.env.local`/staging/production | Nhánh vector tìm kiếm | `NO-MOCK-RUNTIME-FOUNDATION`, `EMBED-MODEL-MISMATCH-GUARD` |
| LLM qua LiteLLM (đã có ở dev) | `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `CLASSIFY_LLM_MODEL`, `DRAFT_LLM_MODEL` (+ `REWRITE_LLM_MODEL`) và bật cờ DB `cf.ai.classify`/`cf.ai.draft` (+ `cf.ai.rewrite`) bằng `pnpm flags:set` | Ô Thử AI, bộ câu kiểm thử, job `pipeline` | `NOMOCK-01-TRYAI-LLM`, `NOMOCK-02-KB-TESTSET` |
| Nhà cung cấp SMS (OTP) — **CHƯA lên lịch** (chốt 08/11: tắt hẳn xác minh SĐT, đăng ký/đăng nhập không phụ thuộc SĐT) | Khi muốn bật lại: nhà cung cấp (eSMS/SpeedSMS/Twilio…), brandname đã đăng ký, khóa API | Xác minh số điện thoại (đang TẮT, ẩn khỏi giao diện) | `SMS-PROVIDER`, `NOMOCK-04-SMS` |
| Kho ảnh đại diện — dùng **SeaweedFS đã có** (S3-compatible), không cần R2/S3 riêng | Env S3 chung: endpoint, bucket, khóa truy cập (staging/production cũng SeaweedFS) | Tải ảnh đại diện | `NOMOCK-05-AVATAR` |
| Master key LiteLLM (khi bật khóa ảo theo workspace) | `LITELLM_MASTER_KEY` | Ngân sách riêng theo workspace | `NOMOCK-08-GUARD-ALL-MOCKS` |
| ~~Quyết định giữ/bỏ dữ liệu mẫu `[MẪU]` ở giao diện dev~~ — đã chốt 08/11: BỎ khỏi trang thật, dùng workspace `[MẪU] Demo Shop` (seed-demo) | — | — | `NOMOCK-07-SAMPLE-DATA-UI` |

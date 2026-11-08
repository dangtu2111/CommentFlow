## LLM-MODEL-REQUIRED — Đặt tên model LLM rõ ràng (không còn model mặc định) · Set LLM model names explicitly

Từ 08/11/2026 ứng dụng KHÔNG còn model mặc định `mock-llm`: cờ bật mà thiếu tên model thì bước đó tắt kèm lỗi rõ. Cấu hình LiteLLM dev/staging cũng không còn `mock-llm`.

| # | Việc của anh | Kết quả đúng |
|---|---|---|
| 1 | Trong `.env.local` (máy code) đặt `CLASSIFY_LLM_MODEL=cf-classify`, `DRAFT_LLM_MODEL=cf-draft` (và `REWRITE_LLM_MODEL=cf-classify` nếu bật viết lại). | Worker/web khởi động không còn log `llm_config_invalid` / lỗi thiếu model. |
| 1b | Bật bước AI bằng cờ DB (không còn `*_LLM_ENABLED` trong env): `pnpm flags:set -- cf.ai.classify on --workspace <uuid>` và `cf.ai.draft` (thêm `cf.ai.rewrite` nếu cần). | Thử AI hết báo "chưa cấu hình AI" cho workspace đó. |
| 2 | Đồng bộ máy ảo (`pnpm cf:dev sync main`) rồi khởi động lại LiteLLM (`pnpm cf:dev up -d litellm`) để nạp `infra/litellm/config.yaml` mới. | `cf-classify`, `cf-draft` còn; `mock-llm` không còn trong danh sách model. |
| 3 | Cập nhật khóa ảo dev: `node scripts/cf-dev-update-virtual-key.mjs` (chỉ cho phép `cf-classify`, `cf-draft`). | Gọi bằng khóa dev chỉ chạy được hai model đó. |

Nếu hỏng: dán dòng log lỗi đầu tiên (đã che khóa). / If it fails: paste the first error log line (keys masked).

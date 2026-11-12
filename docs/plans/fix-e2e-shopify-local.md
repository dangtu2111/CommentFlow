# Kế hoạch `fix/e2e-shopify-local` — sửa 6 ca E2E lỗi cục bộ (Shopify, Thử AI) theo nguyên nhân gốc

## Việc

Chủ dự án (12/11/2026): "ca Shopify vẫn lỗi cục bộ như trên main: không bỏ qua; tìm nguyên nhân gốc; môi trường máy → sửa test cho không phụ thuộc môi trường; code → sửa code kèm test hồi quy; PR riêng nhỏ, trước POST-HYDRATE". Bốn ca Thử AI lỗi cùng lúc cũng được điều tra.

**Tóm tắt (2–3 câu dễ hiểu):** Trên máy dev, E2E lỗi 6 ca (Shopify vi/en, Thử AI "đường thành công" vi/en, "chưa cấu hình AI" vi/en) mà CI vẫn xanh. Điều tra ra ba nguyên nhân khác nhau: hai do `.env` của máy lọt vào E2E (sửa test/môi trường) và một là LỖI CODE thật (bước "viết lại câu hỏi" làm hỏng cả lượt khi cờ tắt). Cả ba đã sửa kèm test; chạy đủ 70 ca E2E cục bộ đều qua.

## Nguyên nhân gốc (đã tái hiện, từng cái một)

1. **Shopify vi/en (môi trường):** `.env` máy có `SHOPIFY_ENABLED=true` → lưu kết nối đổi token với Shopify THẬT, tên miền E2E không tồn tại → "Chưa kiểm tra được với Shopify". CI không đặt cờ. Sửa: `buildE2eEnv` ép `SHOPIFY_ENABLED=false` (và `FB_OAUTH_ENABLED=false`, cùng nguyên nhân gốc với lỗi khóa mã hóa token hôm 12/11).
2. **"Chưa cấu hình AI" vi/en (môi trường):** bản web thứ hai xóa `LITELLM_*` khỏi môi trường, nhưng `next.config.ts` gọi `loadRepoEnv` — `process.loadEnvFile` chỉ không ghi đè biến ĐÃ CÓ, biến vắng mặt được nạp lại từ `.env` ở gốc repo → web vẫn có LiteLLM. Sửa: đặt `LITELLM_*` thành chuỗi RỖNG (hàm `buildNoAiEnv`, có test).
3. **"Đường thành công" vi/en (LỖI CODE):** `.env` máy có `REWRITE_LLM_MODEL` còn cờ `cf.ai.rewrite` tắt → bộ viết lại được dựng nhưng cổng cờ ném `LLM_UNAVAILABLE` ("Bước AI rewrite đang tắt") → cả lượt Thử AI hỏng "Không thử được lúc này". Bước viết lại là tùy chọn (khác classify/draft bắt buộc) nên cờ tắt phải bỏ qua, không làm hỏng lượt. Sửa: `llm-deps.ts` — cờ tắt → dùng `ruleResult` (câu tìm kiếm theo quy tắc, không tốn LLM); test hồi quy ở `llm-deps.test.ts`. Ảnh hưởng thật: mọi workspace có `REWRITE_LLM_MODEL` mà chưa bật `cf.ai.rewrite` đều không dùng được Thử AI/pipeline.

Chẩn đoán thêm (giữ lại): log `try_ai_failed` kèm mã lỗi nghiệp vụ và, với `LLM_UNAVAILABLE`/`CONFIG_INVALID`, thông điệp cố định (không nội dung khách); dịch vụ LLM giả ghi tên bước lạ ra stderr.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. `pnpm e2e` đủ bộ qua cục bộ (trước: 54 qua, 6 lỗi, 4 không chạy).
2. Test đơn vị: `buildE2eEnv` ép cờ tắt; `buildNoAiEnv` đặt LITELLM_* rỗng; `llm-deps` cờ rewrite tắt → câu quy tắc; `try-ai` log mã lỗi không lộ nội dung.
3. typecheck, biome, test ai/web/scripts xanh; CI xanh.

## File sẽ đọc / sửa

Sửa: `scripts/lib/e2e-env.mjs` (+ test), `scripts/e2e.mjs`, `packages/ai/src/try/llm-deps.ts` (+ test), `apps/web/src/server/try-ai.ts` (+ test), `e2e/fake-services/fake-litellm.mjs`.

## Migration

Không.

## Test viết trước

Các test nêu ở tiêu chí 2; tái hiện bằng E2E cục bộ trước khi sửa (6 ca đỏ).

## Lệnh test phạm vi hẹp

`pnpm --filter ./scripts test` · `pnpm --filter @flow/ai exec vitest run src/try` · `pnpm --filter @flow/web exec vitest run src/server/try-ai.test.ts` · `pnpm e2e`.

## Cần kiểm chứng độc lập không?

Không: không đụng auth/RLS/migration/cổng tự gửi/`sendRecheck`/che PII; thay đổi code chỉ ở bước viết lại câu hỏi tùy chọn (khi cờ tắt dùng đường quy tắc có sẵn).

## Rủi ro / câu hỏi cho chủ dự án

Khi cờ `cf.ai.rewrite` tắt, pipeline dùng câu quy tắc thay vì làm hỏng lượt — đúng ý "bước tùy chọn" nhưng là đổi hành vi so với trước (trước: lỗi). Không ảnh hưởng EVAL vì EVAL bật cờ.

# Dịch vụ giả chỉ cho CI/E2E (LLM và embedding)

Chủ dự án chốt 08/11/2026: ứng dụng KHÔNG chạy bản giả khi vận hành. Để E2E vẫn kiểm được **đường thành công** của AI, CI dựng hai dịch vụ giả **bên ngoài ứng dụng** (tiến trình riêng, nói đúng giao thức thật); ứng dụng dùng **client thật** và chỉ trỏ địa chỉ dịch vụ sang đó.

## Nguyên tắc
- **Không có đường mock nào trong mã ứng dụng** và không chọn được bằng biến môi trường: chỉ đổi URL dịch vụ (`LITELLM_BASE_URL`, `ML_URL`). Cờ bật dịch vụ thật (`CLASSIFY_LLM_ENABLED`, `DRAFT_LLM_ENABLED`, `ML_EMBED_ENABLED`) là cờ vận hành bình thường.
- **Kết quả KHÔNG phải số đo chất lượng.** Dịch vụ giả trả JSON/vector cố định; chỉ để kiểm luồng (nhãn → hành động → câu trả lời có nguồn, bản nháp xuất hiện…). Không dùng để so sánh model, prompt hay chọn cấu hình. Số đo chất lượng chỉ từ EVAL với model thật (LiteLLM + bge-m3).
- Chỉ chạy ở CI/E2E (`pnpm e2e`) hoặc test tự động; không đóng gói vào ứng dụng.

## Hai dịch vụ (`e2e/fake-services/`)
| Dịch vụ | Giao thức | Trả về |
|---|---|---|
| `fake-litellm.mjs` | `POST /v1/chat/completions` (OpenAI/LiteLLM; đọc `metadata.step`, `metadata.prompt_version`) | `extract`: JSON có nhãn theo từ khóa + `asks`; `draft`: câu trả lời cố định, nguồn = `<source id="…">` hợp lệ đầu tiên trong prompt (không có nguồn → xin chuyển nhân viên); bước lạ → HTTP 400 |
| `fake-ml.mjs` | `POST /embed` | vector 1024 chiều xác định theo văn bản, model `bge-m3-test` (đổi bằng `FAKE_ML_MODEL`) |

`scripts/e2e.mjs` khởi động cả hai trên cổng trống, đặt `LITELLM_BASE_URL`/`ML_URL`/`LITELLM_API_KEY`/cờ bật và model; rồi chạy **lệnh vận hành thật** `kb:switch-embedding -- bge-m3-test` để kích hoạt model embedding trong DB test (cần `TEST_DATABASE_WORKER_URL`; CI đã đặt). Có thêm một bản web thứ hai **không có LLM** (`E2E_NOAI_BASE_URL`) cho kịch bản "chưa cấu hình AI".

## Kịch bản
- `ai-happy-path.spec.ts` (vi + en): Owner nhập FAQ thật → Thử AI ra nhãn, hành động `answer`, câu trả lời và nguồn là chính FAQ.
- `ai-not-configured.spec.ts` (vi + en): bản web không có LLM → Thử AI báo "chưa cấu hình AI thật", không có kết quả mẫu.
- `kb-content.spec.ts`: ô chạy thử ở tổng quan KB báo "chưa có kiến thức để thử" khi workspace mới.
- Test đơn vị: `e2e/support/fake-services.test.ts` (giao thức của hai dịch vụ giả) và `apps/web/src/server/try-ai-fake-services.test.ts` (client LLM thật → dịch vụ giả → pipeline và guard của ứng dụng).

Chưa làm (gap `E2E-AI-HAPPY-PATH`, giai đoạn 2): worker trong E2E để kiểm webhook fixture → pipeline → bản nháp hiện ở chi tiết bình luận, và nút "Soạn gợi ý" tạo bản nháp mới.

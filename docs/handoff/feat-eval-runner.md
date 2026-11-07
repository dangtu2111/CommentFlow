# Handoff feat/eval-runner (claude)

Đã làm (tự kiểm, chưa có kiểm chứng độc lập): EVAL-RUNNER (`tools/eval`): bộ chạy + chấm §4.2 theo 4 nhóm ngôn ngữ + chi phí/1.000 lượt tách `extract/rewrite/draft` + kiểm token suy luận ≈ 0; lớp nối promptfoo 0.125.1 (MIT, `pnpm dlx`); bộ `synthetic` 56 mẫu (cửa hàng "Demo" giả); định dạng bộ ~300 mẫu thật (`CAN_BAN_CUNG_CAP`). Nền: `ai_usage.reasoning_tokens` (migration 0069), `rewrite` nối vào pipeline, `variantCount` (prompt `draft@4`), bí danh LiteLLM `cf-classify`/`cf-draft`/`cand-*`.

## Kết quả đo thật (07/11/2026, bộ SYNTHETIC — chỉ dẫn, KHÔNG dùng để chọn model hay báo đạt cổng)
Gọi trực tiếp OpenAI (`--backend openai-direct`, trần $0,50), 56 mẫu, 5 phiên bản câu soạn (4 biến thể), 0 lần lỗi.

| Cấu hình (extract+rewrite → draft) | Nhãn đúng | Hành động đúng | $/1.000 lượt (extract / rewrite / draft) | Tổng | Token suy luận |
|---|---|---|---|---|---|
| gpt-5-nano (minimal) → gpt-5.6-luna (none) | 35/56 (62,5%) | 33/56 | 0,0603 / 0,0051 / 0,362 | **$0,427** | 0 (đạt) |
| gpt-5.6-luna (none) → gpt-5.6-luna (none) | **56/56 (100%)** | 31/56 | 0,196 / 0,0144 / 0,367 | **$0,577** | 0 (đạt) |

- Cả hai dưới trần $2/1.000 lượt nên KHÔNG cần thử giảm biến thể 5 → 3 (runner tự làm khi vượt).
- `reasoning_effort` thấp nhất thật sự cho token suy luận = 0 ở cả hai model (đã kiểm bằng `UsageRecord.reasoningTokens`, cùng số liệu của `ai_usage.reasoning_tokens`).
- Giá lấy từ trang model OpenAI ngày 07/11/2026 (nano $0,05/$0,005/$0,40; luna $0,20/$0,02/$1,20 mỗi 1M token). `gpt-5-nano` **Deprecated, tắt 11/12/2026** (xem Q-LLM1); OpenAI đề nghị `gpt-5.6-luna`.

## Phát hiện từ lần chạy thật (cần xử lý; chưa sửa trong nhánh này)
1. **Lỗi sản phẩm đã sửa trong nhánh:** mã nguồn đoạn chính sách/FAQ của ô Thử AI dùng ký tự `#` (`policy:<id>#0`), bị `buildDraftMessages` từ chối (`SOURCE_ID = [A-Za-z0-9_:.-]{1,64}`) → khi bật LLM thật, mọi câu hỏi về chính sách/FAQ lỗi. Đổi sang `.` + test đi qua `buildDraftMessages`. Trước đây không ai thấy vì bộ soạn mẫu không kiểm mã.
2. **`gpt-5-nano` gán sai nhãn** hỏi phí ship ("price" 4/4, mẫu kỳ vọng `advice`), hỏi tồn kho (3/4 → `price`), hỏi VAT (4/4 → `price`); `gpt-5.6-luna` đúng 56/56. Lưu ý: "hỏi phí ship" tính `price` hay `advice` là QUY ƯỚC của chủ dự án — nếu quy ước đổi, gán lại đáp án.
3. **Hành động sai ở cả hai model (lỗi nằm ở code, không phải model):** (a) câu mơ hồ không nêu sản phẩm ("Bao nhiêu vậy shop?") ra `redirect`, spec FR-147 mong `clarify` (0/4); (b) hỏi VAT ra `redirect`, mong `handoff` (FR-160, 0/4); (c) prompt injection ra `clarify`, mong `handoff` (0/4). Nguyên nhân gần: `runTryPipeline` truyền `risks: { priceConflict: false, legalUnsourced: false, … }` cố định và không có phát hiện injection từ câu của khách — các luật `DA-RULES-*` có sẵn ở dạng hàm thuần nhưng chưa nối vào pipeline (cùng nhóm `PIPE-ORCHESTRATOR`).
4. Đáp án `synthetic` do người viết quy ước theo spec nên có thể sai; xem lại từng mẫu trượt trước khi kết luận về model.

## Còn lại
- Nhập `OPENAI_API_KEY` lên máy ảo (mục `OPENAI-KEY`) rồi chạy lại `--backend litellm` để xác nhận chi phí từ header LiteLLM khớp bảng giá, và chạy promptfoo với model thật.
- Bộ ~300 mẫu thật (mục `EVAL-SET-REAL`) → mới chọn model chính thức và báo đạt Cổng 2.
- Thêm Anthropic/Gemini: khóa lên máy ảo + thêm một mục providers (bí danh `cand-*` có sẵn), không sửa code.
- `AI-USAGE-DAILY-REASONING`: mang `reasoning_tokens` sang `ai_usage_daily` trong `compact_ai_usage`.
- Nối `risks` thật (DA-RULES-LEGAL, injection…) và quy tắc "mơ hồ → clarify" vào pipeline (Bước 4, `PIPE-ORCHESTRATOR`); sau đó chạy lại để xem chỉ số hành động tăng.
- Bước 2 `brand_voice` thật vào Thử AI; Bước 3 mô tả/metafield Shopify (FR-058) + cảnh báo tiền tệ ≠ VND; Bước 4 `PIPE-ORCHESTRATOR` → `drafts` → các `*-WIRE`.

# Kế hoạch `feat/eval-runner` — EVAL-RUNNER (Bước 1 lõi AI)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt 07/11/2026: dùng promptfoo MIT ghi giấy phép vào decisions; cấu hình đánh giá ban đầu `cf-classify` = gpt-5-nano, `cf-draft` = gpt-5.6-luna, reasoning thấp nhất, báo chi phí/1.000 lượt tách theo bước, thử giảm biến thể 5 → 3 nếu > $2, ghi rủi ro gpt-5-nano Deprecated, giữ `cand-*` để thêm Anthropic/Gemini sau).

## Việc

Mã gap matrix: `EVAL-RUNNER` (MASTER), `EVAL-SET-REAL` (chỉ định dạng), `COST-GATE` (đo ≤ $2/1.000 lượt) · Spec: `docs/14` §4, FR-120, FR-165, `docs/09` §4/§6.0.

**Tóm tắt:** Dựng bộ chạy đánh giá AI: chạy bộ mẫu qua đúng pipeline của ô Thử AI với từng cấu hình model, tính các chỉ số `14` §4.2 theo từng nhóm ngôn ngữ và **chi phí/1.000 lượt tách theo bước** (extract / rewrite / draft, tính cả token suy luận), kiểm token suy luận ≈ 0. Kèm lớp nối promptfoo (chạy bằng `pnpm dlx`, không thêm vào lockfile), bộ mẫu `synthetic` chỉ để chạy thử, và định dạng bộ ~300 mẫu thật. Để đo được chi phí tách bước thật: thêm cột `ai_usage.reasoning_tokens` (migration 0069), nối bước `rewrite` vào pipeline, số biến thể cấu hình được. Rủi ro: chạy thật tốn tiền (có trần riêng); chưa chạy qua LiteLLM (chờ khóa trên máy ảo).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `pnpm --filter @flow/eval evaluate` chạy bộ mẫu qua pipeline thật và in báo cáo: chỉ số §4.2 theo 4 nhóm ngôn ngữ + chi phí/1.000 lượt tách `extract/rewrite/draft` + kiểm token suy luận ≈ 0 + kết luận — kiểm bằng: test `report.test.ts`, `metrics.test.ts`; chạy thật `--backend openai-direct` (56 mẫu, 0 lỗi).
2. Bộ `synthetic` không bao giờ cho kết luận "đạt cổng" (n/a); chỉ bộ `real` đủ ≥ 30 mẫu/nhóm mới được kết luận — kiểm bằng: `report.test.ts`.
3. Tổng chi phí > $2/1.000 lượt thì runner tự thử giảm biến thể 5 → 3 và in so sánh — kiểm bằng: `run.ts` (logic), `report.test.ts` (`overBudget`).
4. `ai_usage.reasoning_tokens` được đọc từ `completion_tokens_details.reasoning_tokens` và ghi — kiểm bằng: `llm-client.test.ts`; cột có trên DB dev và `cf_app` có quyền.
5. Runner dùng khóa trực tiếp có trần số lần gọi và chi phí, chỉ gọi `api.openai.com`, khóa chỉ ở header — kiểm bằng: `openai-direct.test.ts`.
6. Lớp nối promptfoo (bản ghim 0.125.1) chạy được và tổng hợp metric theo tên — kiểm bằng: chạy thật backend `mock` (56 test, 0 lỗi); `runner.test.ts`.
7. Bí danh LiteLLM `cf-classify` (gpt-5-nano, minimal), `cf-draft` (gpt-5.6-luna, none), `cand-*` giữ nguyên — kiểm bằng: đọc `infra/litellm/config.yaml`.
8. Giấy phép promptfoo (MIT, 0.125.1) ghi ở `docs/decisions/016-promptfoo-eval.md`; rủi ro gpt-5-nano Deprecated ghi ở `Q-LLM1`; định dạng bộ thật ở `CAN_BAN_CUNG_CAP.md`.
9. `pnpm precheck` xanh; gói `ai` giữ coverage 100% lines/functions.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/ai/src/try/try-pipeline.ts`, `rewrite/rewriter.ts`, `llm-client.ts`, `draft/draft-prompt.ts`, `docs/14` §4, `docs/09` §4.

## File sẽ sửa / tạo

`tools/eval/**` (mới); `packages/ai/src/try/try-pipeline.ts`, `draft/*`, `llm-client.ts`, `try/db-shop-knowledge.ts`; `packages/db` (migration 0069, schema); `apps/web/src/server/try-ai*.ts`; `infra/litellm/config.yaml`; tài liệu.

## Migration

`0069_ai_usage_reasoning_tokens.sql`: `ALTER TABLE cf.ai_usage ADD COLUMN reasoning_tokens integer NOT NULL DEFAULT 0` + CHECK `>= 0`. Thêm cột (mặc định không null, không khóa bảng lâu trên PG16); `cf_app` có quyền ở mức bảng (0001). Hạn chế đã ghi: `compact_ai_usage` chưa mang cột sang bảng ngày (chi phí vẫn đúng). Đường lùi: `DROP COLUMN`.

## Test viết trước

Chấm mẫu từng loại (đúng, sai giá, điều cấm, lần chạy lỗi, mẫu không áp dụng); chi phí tách bước; cổng kết luận; trần chi phí/lần gọi của adapter; dịch tham số; mã nguồn hợp lệ với bước soạn.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/eval test` · `pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Có migration nên thuộc diện nhạy cảm: tự kiểm theo `verify.md` (cột thêm, quyền, không PII, không log khóa), gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập".

## Rủi ro / câu hỏi cho chủ dự án

Số đo trên bộ `synthetic` chỉ mang tính chỉ dẫn. Cần bộ ~300 mẫu thật để chọn model.

## Đề xuất thay đổi

Xem `docs/handoff/feat-eval-runner.md` mục "Phát hiện từ lần chạy thật".

## Complexity tracking

Thêm công cụ `promptfoo` (MIT, 0.125.1) theo spec `docs/14` §4, chạy bằng `dlx` nên không đổi lockfile; ghi ở `docs/decisions/016-promptfoo-eval.md`. Không vi phạm nguyên tắc nào khác.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

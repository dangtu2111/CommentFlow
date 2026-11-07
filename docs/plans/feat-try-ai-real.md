# Kế hoạch `feat/try-ai-real` — Ô Thử AI đọc dữ liệu thật của shop

**Trạng thái duyệt:** Đã duyệt (phạm vi A + B; chủ dự án chọn "Dữ liệu shop", 07/11/2026). Lát C làm sau.

## Việc

Mã gap matrix: `TRY-AI-REAL` · Spec: `docs/09_System_Architecture.md` §4–§6, FR-059, FR-029.

**Tóm tắt:** Hiện ô Thử AI (`/app/try-ai`) chạy bằng dữ liệu mẫu: sản phẩm mẫu, bộ trích xuất và bộ soạn câu giả. Việc này nối nó vào dữ liệu thật của shop theo 3 lát nhỏ, mỗi lát dùng được riêng: (A) sản phẩm/giá/tồn thật, gồm 40 sản phẩm Shopify đã nạp; (B) chính sách, FAQ, giọng văn thật; (C) LLM thật soạn câu, sau cờ mặc định TẮT. Rủi ro chính: lát C tốn tiền LLM và cần khóa của chủ dự án; lát A/B không tốn tiền, không migration.

## Điểm chưa rõ

Quyết định: làm A + B trước (không tốn tiền, không cần khóa); lát C (LLM thật) chờ khóa + model + trần chi phí từ chủ dự án.

## Tiêu chí nghiệm thu

1. Hỏi "<tên sản phẩm Shopify thật> giá bao nhiêu?" → nguồn trả về là sản phẩm thật, giá/tồn khớp bảng `products` — kiểm bằng: test tích hợp + thử tay ở `/app/try-ai`.
2. Hỏi về sản phẩm không tồn tại → AI không bịa giá, hành động hỏi lại/chuyển người — kiểm bằng: test `matchProducts` không khớp.
3. Mọi số tiền trong câu soạn có trong nguồn (guard tiền, nguyên tắc #4) — kiểm bằng: test hiện có `guard-money` chạy trên dữ liệu thật.
4. Dữ liệu workspace khác không bao giờ xuất hiện — kiểm bằng: test tích hợp chéo workspace (`withActor`, RLS).
5. Chính sách/FAQ/giọng văn của workspace hiện trong nguồn và trong câu soạn (lát B) — kiểm bằng: test + thử tay.
6. Cờ LLM TẮT → hành vi như cũ, không gọi mạng, không tốn tiền (lát C) — kiểm bằng: test cờ tắt.
7. Mỗi lần gọi LLM thật ghi `ai_usage` và che PII trước khi gửi (lát C) — kiểm bằng: test.

## File sẽ đọc

`packages/ai/src/try/try-pipeline.ts` (giao diện `TryKnowledge`), `packages/ai/src/try/kb-try-knowledge.ts`, `apps/web/src/server/try-ai.ts`, `apps/web/src/server/try-ai-knowledge.ts`, `packages/db/src/queries/` (truy vấn `products`, `policy_items`, `faq_items`, `brand_voice`), `packages/ai/src/draft/draft-config.ts`, `packages/ai/src/classify/extractor.ts`.

## File sẽ sửa / tạo

- Lát A: `packages/db/src/queries/try-products.ts` (khớp tên + đọc giá/tồn/biến thể của workspace), `apps/web/src/server/try-ai-knowledge.ts` (nối `matchProducts`/`lookupProductFacts` thật), test.
- Lát B: nối `policy_items`/`faq_items` (KB chưa xuất bản vẫn dùng được cho thử) + `brand_voice` thật vào `try-ai.ts`.
- Lát C (nếu duyệt): bộ trích xuất/soạn thật theo `DRAFT_LLM_ENABLED`/`CLASSIFY_LLM_ENABLED`, ghi `ai_usage`.

## Migration

Không có.

## Test viết trước

Khớp sản phẩm (tên gần đúng, không khớp), cách ly workspace, guard tiền trên dữ liệu thật, cờ tắt.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/try` · `pnpm --filter @flow/web exec vitest run src/server/try-ai` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/try-products.int.test.ts`

## Cần kiểm chứng độc lập không?

Lát A/B: không. Lát C: có (gọi LLM, che PII, `ai_usage`) — tự kiểm theo `verify.md`, gắn nhãn "tự kiểm", không tự merge.

## Rủi ro / câu hỏi cho chủ dự án

Embedding đang là bản fixture; tìm kiếm ngữ nghĩa trong KB đã xuất bản chỉ tốt khi có embedder thật (cũng cần khóa). Lát A/B không phụ thuộc điều này vì sản phẩm đi đường SQL.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

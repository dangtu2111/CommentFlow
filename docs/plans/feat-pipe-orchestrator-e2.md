# Kế hoạch `feat/pipe-orchestrator-e2` — PIPE-ORCHESTRATOR lát E2 (ngữ cảnh hội thoại + trần trả lời FR-167)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chỉ đạo 07/11/2026: lát E2 trước lát F, kèm điểm 6 "trạng thái hội thoại có cấu trúc" và FR-167 trần trả lời theo (khách, bài) 24 giờ). Có migration 0076 chỉ-thêm → tự merge khi CI xanh (Q-MRG2); phần trần trả lời là logic quy tắc nên tự kiểm theo `verify.md` §A.

## Việc

Mã gap matrix: `PIPE-CONVO-CONTEXT`, `AI-REPLY-CAP-CUSTOMER-POST` · Spec: FR-137, FR-144, FR-167; docs/09 §4; docs/10 §5.1; Q-POR12, Q-POR14.

**Tóm tắt:** (1) Không có ngữ cảnh thì "hỏi lại" vô dụng: khách trả lời "M đen" → AI không biết sản phẩm → hỏi lại → chuyển người. Nối ngữ cảnh hội thoại thật (≤ 5 lượt gồm câu shop đã gửi, bình luận cha, caption, sản phẩm gắn bài, ≤ 3 câu hỏi bài khác 7 ngày) và **trạng thái có cấu trúc** (sản phẩm đã nhận + ý đang chờ, ghi ở `drafts.context_refs`) vào `extract`, nhận sản phẩm, viết lại câu hỏi và soạn câu (lịch sử trong khối `<history>` có thẻ, chống cài lệnh). (2) Trần trả lời: tối đa N (mặc định 3, Owner 1–5) câu AI cho (khách, bài) trong 24 giờ, gộp mọi chuỗi + bình luận mới; chạm trần → câu chốt mời nhắn tin (không extract/tìm kiếm), vượt trần → `needs_human` chặn trước extract và trước khi trừ lượt. (3) Ô Thử AI nhận "lượt trước"; EVAL-RUNNER đo được mẫu nhiều lượt; hàng đợi ưu tiên bình luận đầu tiên của khách.

## Điểm chưa rõ

Không có. (Giao diện Owner chỉnh ngưỡng 1–5 → lát F/Cài đặt: cột đã có, CHECK 1–5; cấp UPDATE theo cột khi làm UI.)

## Tiêu chí nghiệm thu

1. Đường vàng 2 lượt ("áo thun basic giá bn?" → hỏi lại size/màu → "M đen" → trả lời 150.000đ, KHÔNG hỏi lại lần 2) ở lõi (unit) VÀ trên DB thật qua job — kiểm bằng: `run-pipeline-convo.test.ts`, `apps/worker/tests/pipeline-convo.int.test.ts`.
2. `loadPipelineContext` trả văn bản ĐÃ che PII: ≤ 5 lượt (gồm câu shop), bình luận cha, caption, tên sản phẩm gắn bài, ≤ 3 câu hỏi bài khác ≤ 7 ngày, trạng thái thô — kiểm bằng: `packages/db/tests/pipeline-convo.int.test.ts`.
3. Sản phẩm: khách nêu tên → so khớp; không nêu tên → trạng thái lượt trước rồi sản phẩm gắn bài; nêu tên mà không khớp → KHÔNG dự phòng — kiểm bằng: `run-pipeline-convo.test.ts`.
4. Prompt: lịch sử trong `<history>` có thẻ, khách không giả được thẻ (kể cả Unicode giống), cắt 300 ký tự mỗi phần — kiểm bằng: `prompt-history.test.ts`.
5. FR-167: trần 3 → câu 1–2 trả lời, câu 3 CHỐT (redirect + Cần hỗ trợ thêm, không extract), câu 4–5 `needs_human` lý do `customer_post_reply_cap`, không gọi LLM, không trừ lượt; ba kịch bản (chuỗi 5 câu; 5 bình luận mới; xen kẽ); bài khác vẫn trả lời; sau 24 giờ trả lời lại; Owner chỉnh 1–5 có hiệu lực — kiểm bằng: `apps/worker/tests/pipeline-cap.int.test.ts`, `reply-cap.test.ts`, `turn-gate.test.ts`.
6. Migration 0076: cột `max_ai_replies_per_customer_post` (mặc định 3, CHECK 1–5) + chỉ mục `comments_customer_post_idx` — kiểm bằng: `pipeline-convo.int.test.ts` (CHECK), `pnpm check:migrations`, `pnpm db:check-rls`.
7. Hàng đợi: bình luận đầu tiên của khách dưới bài priority cao hơn — kiểm bằng: `ingest.int.test.ts`, test `countRepliesForCommentThread`.
8. EVAL-RUNNER: mẫu có `thread` (tối đa 5 lượt) phát lại lượt khách trước để có trạng thái thật — kiểm bằng: `dataset.test.ts`, `run-sample.test.ts`.
9. Ô Thử AI: ô "lượt trước" tùy chọn, đã che PII, tối đa 5 lượt — kiểm bằng: `try-ai-previous.test.ts`, `try-ai.test.ts`.
10. FR-167 ghi vào docs/05, 09 §4, 10, 14, 16 và `QUYET_DINH_CHO_DUYET.md` (Q-POR14); `pnpm precheck` xanh; gói `ai` coverage 100%.

## File sẽ đọc / sửa

Đọc: `run-pipeline.ts`, `customer-context.ts`, `pipeline-context.ts`, `turn-gate.ts`, `extract-prompt.ts`, `draft-prompt.ts`, `tools/eval/src/{dataset,run-sample}.ts`, `try-ai.ts`. Sửa/tạo: `packages/ai/src/pipeline/{conversation-state,reply-cap,run-pipeline,turn-gate,persist-records}.ts`, `prompt-history.ts`, prompt/drafter/extractor, `try/db-product-knowledge.ts`; `packages/db/src/queries/{pipeline-convo,pipeline-context,pipeline-persist}.ts`, migration `0076`, schema; `apps/worker/src/jobs/{pipeline-job,pipeline-run,ingest}.ts`, `main.ts`; `tools/eval`; web `try-ai.ts`, `try-ai-previous.ts`, form, i18n; tài liệu.

## Migration

`0076_customer_post_reply_cap.sql`: `ADD COLUMN automation_settings.max_ai_replies_per_customer_post integer NOT NULL DEFAULT 3` + CHECK 1–5 + `CREATE INDEX comments_customer_post_idx (workspace_id, post_id, author_external_id)`. Chỉ-thêm (không DROP/RENAME/đổi kiểu/đổi dữ liệu/nới RLS). Đường lùi: `DROP INDEX cf.comments_customer_post_idx; ALTER TABLE cf.automation_settings DROP COLUMN max_ai_replies_per_customer_post;`.

## Cần kiểm chứng độc lập không?

Không bắt buộc (chỉ-thêm; không chạm auth/RLS/thanh toán/đường gửi). Trần trả lời là logic quy tắc nên tự kiểm theo `verify.md` §A, ghi ở handoff; chủ dự án có thể kiểm chéo nếu muốn.

## Rủi ro / câu hỏi cho chủ dự án

Thử AI không phát lại lượt trước để lấy trạng thái (tránh tốn LLM): chỉ truyền lịch sử vào extract/viết lại/soạn câu. EVAL-RUNNER thì phát lại để đo đúng đường worker. Giao diện Owner chỉnh ngưỡng → lát F.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

# Kế hoạch `feat/pipe-orchestrator-d` — PIPE-ORCHESTRATOR lát D (ghi kết quả: bản nháp, nhật ký tìm kiếm, lỗ hổng kiến thức)

**Trạng thái duyệt:** Đã duyệt (lát D của `docs/plans/feat-pipe-orchestrator.md`, chủ dự án duyệt 07/11/2026 và chỉ đạo thêm Q-POR6/Q-POR7). GĐ2: soạn gợi ý, KHÔNG gửi.

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (lát D), `RETRIEVAL-LOG-WIRE` · Spec: `docs/09` §4 (`persist`), FR-029, FR-032, FR-111, FR-134, FR-141; Q-POR3/5/6/7.

**Tóm tắt:** Nối kết quả của `runPipeline` vào DB cho MỘT bình luận: ghi bản nháp (`drafts`, kèm biến thể, nguồn, ảnh chụp giá, kết quả `extract`), nhật ký tìm kiếm (`retrieval_logs`), lỗ hổng kiến thức (`kb_gaps`), cập nhật bình luận (nhãn, ngôn ngữ, cần theo dõi, trạng thái) — tất cả trong MỘT giao dịch, idempotent (chạy trùng chỉ một bản nháp), văn bản lưu đã che PII. Bị chặn hết lượt/hết lần thử hoặc AI trả đầu ra không đọc được → bản nháp "Cần nhân viên" kèm lý do. Dừng khẩn cấp → không ghi gì (bình luận giữ `new`, Q-POR7). Tổng thời gian chờ LLM trong một lượt nhỏ hơn thời gian thuê (gia hạn thuê trước mỗi bước dài, Q-POR6). **Chưa có job/hàng đợi (lát E) và chưa có đường gửi.**

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Lượt thành công: MỘT giao dịch ghi `drafts` (text, lang, nguồn, độ tin cậy, `needs_human`, lý do, action, biến thể, claims, chủ đề thiếu, `extracted`, `confidence_components`, `price_snapshot` từ nguồn sản phẩm đã dùng), `retrieval_logs` (truy vấn đã che PII, route, `kb_version`, đoạn đã dùng, sản phẩm nhận ra), `kb_gaps` (mỗi chủ đề thiếu, cộng dồn), cập nhật `comments` (nhãn, ngôn ngữ, văn bản chuẩn hóa, `needs_followup`, `followup_topics`, trạng thái `pending_review`/`needs_human`) và khóa lượt `done` — kiểm bằng: `pipeline-persist.int.test.ts`.
2. Idempotent: chạy ghi hai lần/đồng thời → chỉ MỘT bản nháp (bình luận đã rời `processing` thì bỏ qua) — kiểm bằng: cùng file.
3. Mọi văn bản ghi (`retrieval_logs`, `kb_gaps`, `drafts`) là bản ĐÃ che PII: bình luận có SĐT/email → quét mọi cột không còn giá trị thô — kiểm bằng: cùng file (nguyên tắc #6).
4. Hết lượt / hết lần thử → bản nháp "Cần nhân viên" (`needs_human`, lý do `quota_exhausted`/`attempts_exhausted`, action `handoff`); AI trả đầu ra không đọc được → "Cần nhân viên" lý do `ai_invalid_output`, khóa `failed`; **dừng khẩn cấp, `busy`, `already_handled` → không ghi gì**; `gate_error` và lỗi tạm khác → nhả thuê và ném để thử lại — kiểm bằng: `pipeline-run.int.test.ts`.
5. Bình luận bị `ruleFilter` bỏ → `skipped`, không bản nháp, không trừ lượt (FR-024) — kiểm bằng: cùng file.
6. Gia hạn thuê trước mỗi lời gọi LLM (tổng thời gian một lượt < thuê) — kiểm bằng: test gia hạn (đếm lần gọi, thuê tăng) — Q-POR6.
7. **Chuyển sang lát E:** bộ chuyển `LlmClient` → `ai_usage` qua `withJob` cần dựng `LlmClient` thật của job `pipeline` (lát E); lát D chỉ nhận extractor/drafter/knowledge qua tham số nên chưa có lời gọi LLM thật ở worker (Q-POR6).
8. Không có đường gửi: lát D không import `send`/`decideAutoSend`/`sendRecheck` — kiểm bằng: `grep` trong diff (tự kiểm, handoff).
9. `pnpm precheck` xanh; gói `ai` coverage 100%; DB/worker tích hợp xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/db/src/queries/drafts.ts`, `retrieval-logs.ts`, `packages/shared/src/{retrieval-log,price-snapshot}.ts`, `packages/ai/src/pipeline/run-pipeline.ts`, `apps/web/src/server/try-ai-knowledge.ts` (mẫu dựng nguồn kiến thức), `packages/ai/src/llm-client.ts`.

## File sẽ sửa / tạo

`packages/ai/src/pipeline/{persist-records.ts,run-pipeline.ts}` (+test), `try/db-product-knowledge.ts` (nguồn có dữ liệu giá có cấu trúc), `packages/db/src/queries/{drafts,try-products}.ts` (+ghi `extracted`/`confidence_components`/`context_refs`; đọc id biến thể + mốc đồng bộ), `apps/worker/src/jobs/{pipeline-persist.ts,pipeline-run.ts,pipeline-knowledge.ts}` (+test tích hợp); tài liệu: Q-POR6/7 (đã ghi), codemap, gap-matrix, handoff.

## Migration

Không có (bảng `drafts`, `retrieval_logs`, `kb_gaps` có sẵn; idempotent bằng CAS trên `comments.status` trong cùng giao dịch, không cần chỉ mục mới).

## Test viết trước

Hàm dựng bản ghi (thuần), ghi một giao dịch trên DB thật (đầy đủ, idempotent, che PII, hoàn tác khi lỗi), hàm chạy trọn một bình luận (đường vàng, hết lượt, hết lần thử, đầu ra không đọc được, dừng khẩn cấp, busy, bỏ qua, lỗi tạm, gia hạn thuê).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run --coverage` · worker `tests/pipeline-persist.int.test.ts tests/pipeline-run.int.test.ts` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Không tự động cần (không migration, không đường gửi, không đụng đếm lượt mới ngoài cổng đã duyệt); tự kiểm theo `verify.md` §A cho phần ghi DB (workspace, PII, bí mật) ghi ở handoff.

## Rủi ro / câu hỏi cho chủ dự án

Nhật ký tìm kiếm chỉ ghi được ứng viên có id dạng uuid (đoạn kiến thức); điểm từng nhánh (vector/toàn văn/trigram) chưa có nên để rỗng — cần mở rộng `TryKnowledge` ở việc sau nếu muốn đầy đủ.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

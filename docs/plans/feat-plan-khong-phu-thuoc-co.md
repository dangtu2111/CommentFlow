# Kế hoạch `feat/plan-khong-phu-thuoc-co` — Fact plan không phụ thuộc cờ `fact_slots` (ADR 018 bước 1)

## Việc

Mã gap matrix: không (ADR 018). Chủ dự án ủy quyền 10/11/2026.

**Tóm tắt (2–3 câu dễ hiểu):** Thẻ chính sách đã duyệt nay luôn được nạp để code lập "fact plan"; cờ `fact_slots` chỉ còn quyết định LLM có viết bằng chỗ giữ chỗ hay không. Khi cờ tắt, plan vẫn giúp (a) câu hỏi đổi trả thường / hàng lỗi trùng phạm vi bảo hành không bị nhãn phụ "khiếu nại" ép chuyển người, (b) dựng câu dự phòng từ thẻ khi bản nháp rỗng. Rủi ro: đổi hành vi cờ tắt (đường đang chạy mặc định) — kiểm bằng đo EVAL cờ tắt và test.

## Điểm chưa rõ

Không có. Các hành vi plan khác (handoff, hỏi khu vực, guard chỗ giữ chỗ) vẫn chỉ ở chế độ cờ bật; T4 gọi lại LLM để bước 2.

## Tiêu chí nghiệm thu

1. Cờ bật → hành vi y hệt (toàn bộ test fact-slots/fact-qualitative hiện có xanh sau khi truyền `factSlotsMode`) — kiểm bằng: `packages/ai/src/pipeline/fact-slots.test.ts`, `fact-qualitative.test.ts`.
2. Cờ tắt → viplain-08/viplain-09/vi-12 trả lời (answer; vi-12 bắt buộc người duyệt, không tự gửi); nhãn chính complaint vẫn chuyển người; nháp tốt không bị thay — kiểm bằng: `fact-plan-no-flag.test.ts`.
3. Job luôn nạp thẻ đã duyệt (bản nháp không bao giờ vào), cờ chỉ bật `mode` — kiểm bằng: `apps/worker/src/jobs/pipeline-job-fact-slots.test.ts`.
4. Cổng EVAL cờ tắt (demo + sswiftly, 1 lượt mỗi bộ) không thấp hơn fs-q13; sai giá, reply_empty, FR-142 = 0; 0 lần chạy lỗi — kiểm bằng: `tools/eval/out/fs-b1`.
5. Tự kiểm theo `verify.md`: không migration/RLS/trigger/auth; thẻ chỉ đọc dòng `approved` — đọc diff (nhãn "tự kiểm").

## File sẽ đọc

`packages/ai/src/pipeline/run-pipeline.ts`, `apps/worker/src/jobs/pipeline-job.ts`, `tools/eval/src/{cli/run.ts,run-sample.ts,runner.ts}`.

## File sẽ sửa / tạo

Sửa: `run-pipeline.ts`, `pipeline-job.ts` (+ test), `tools/eval/src/{cli/run.ts,run-sample.ts,runner.ts}`, `fact-slots.test.ts`, `fact-qualitative.test.ts`, `docs/decisions/018-b-plus-guard-theo-the.md`. Tạo: `fact-plan-no-flag.test.ts`.

## Migration

Không.

## Test viết trước

Test viết cùng mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline`; `pnpm --filter @flow/worker exec vitest run src/jobs/pipeline-job-fact-slots.test.ts`

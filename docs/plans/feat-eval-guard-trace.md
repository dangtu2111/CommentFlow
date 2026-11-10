# Kế hoạch `feat/eval-guard-trace` — Dấu vết guard cho EVAL + ADR 018 (DRAFT)

## Việc

Mã gap matrix: không (công cụ đo). Chủ dự án chọn hướng B (tắt `fact_slots`, LLM diễn đạt từ đoạn tìm được) kèm giảm lỗi.

**Tóm tắt (2–3 câu dễ hiểu):** Chưa sửa guard. Thêm dấu vết quan sát (chỉ ghi, không đổi hành vi) vào pipeline và toàn bộ đoạn tìm được vào kết quả EVAL, kèm bộ phân tích tách lỗi guard "oan" (nội dung có ở đoạn khác) khỏi lỗi "thật" (không có ở đâu). Đo cơ sở fs-b0 (cờ tắt) và soạn ADR 018 (DRAFT, chờ duyệt) mô tả guard theo thẻ.

## Điểm chưa rõ

Không có. ADR 018 chờ chủ dự án duyệt trước khi code guard.

## Tiêu chí nghiệm thu

1. `runPipeline` trả `guardTrace.concept` (khái niệm bị bắt, câu nháp gốc, nguồn đã dùng) khi guard khái niệm loại bản nháp, và KHÔNG có khi nháp sạch; hành vi không đổi — kiểm bằng: `packages/ai/src/pipeline/claim-support.test.ts`.
2. EVAL ghi toàn bộ `found` và `guardTrace` mỗi mẫu; báo cáo có mục oan/thật — kiểm bằng: `tools/eval/src/guard-analysis.test.ts`.
3. Không đổi guard, không migration/RLS/auth — kiểm bằng: đọc diff.

## File sẽ đọc

`packages/ai/src/pipeline/run-pipeline.ts`, `tools/eval/src/run-sample.ts`, `tools/eval/src/cli/run.ts`.

## File sẽ sửa / tạo

Sửa: `packages/ai/src/pipeline/run-pipeline.ts`, `packages/ai/src/root-modules.ts`, `claim-support.test.ts`, `tools/eval/src/run-sample.ts`, `tools/eval/src/cli/run.ts`. Tạo: `tools/eval/src/guard-analysis.ts` (+ test), `docs/decisions/018-b-plus-guard-theo-the.md`.

## Migration

Không.

## Test viết trước

Test viết cùng mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline/claim-support.test.ts`; `pnpm --filter @flow/eval exec vitest run src/guard-analysis.test.ts`

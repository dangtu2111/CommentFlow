# Kế hoạch `feat/kb-distill-force-first` — cờ `--force-first N` cho `kb:distill` và đo `distill@2`

## Việc

Chủ dự án (12/11/2026): đo `distill@2` trên Shop Thử 2 bằng CLI `kb:distill` với tùy chọn bỏ qua `distill_hash` cho 20 đoạn đầu, so với lần chạy 103 nháp ngày 11/11, chi phí ≤ 0,20 USD, ghi `docs/testing/eval-kb-distill-v2-2026-11-12.md`; không bật cờ cho workspace khác.

**Tóm tắt (2–3 câu dễ hiểu):** Lệnh chắt lọc chạy tay chưa có cách chạy lại đoạn đã chắt lọc (vì đã đánh dấu `distill_hash`), nên không đo lại được prompt mới. Thêm cờ `--force-first N` (1–100): chỉ xét N đoạn đầu theo `chunk_key` và bỏ qua dấu đã chắt lọc. Chỉ lệnh chạy tay dùng; luồng worker tự động không đổi. Rủi ro: chạy lại ghi thêm FAQ nháp (Owner duyệt/bỏ) — không đụng dữ liệu đã duyệt.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. `listChunksToDistill(..., { ignoreDistillHash: true })` trả cả đoạn đã đánh dấu, theo `chunk_key`, có giới hạn, vẫn loại đoạn nghi cài lệnh/FAQ/sản phẩm.
2. Không truyền cờ → hành vi cũ (đoạn đã đánh dấu bị bỏ qua).
3. `--force-first` chỉ nhận số nguyên 1–100; CLI báo thêm số `shop_field` đạt/ghi.
4. Báo cáo đo ghi số đạt/bị loại theo lý do, chi phí ≤ 0,20 USD.

## File sẽ đọc / sửa

Sửa: `packages/db/src/queries/kb-distill.ts`, `apps/worker/src/jobs/kb-distill.ts`, `apps/worker/src/cli/kb-distill.ts`, `docs/codemap.d/lenh-kb-distill.md`. Thêm: `docs/testing/eval-kb-distill-v2-2026-11-12.md`. Test: `packages/db/tests/kb-distill.int.test.ts`.

## Migration

Không.

## Test viết trước

`kb-distill.int.test.ts`: ca "ignoreDistillHash".

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db tests/kb-distill.int.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/kb-distill.test.ts`.

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS/migration; chỉ thêm tùy chọn cho lệnh dev).

## Rủi ro / câu hỏi cho chủ dự án

Số đo `distill@2` ít hơn `distill@1` về sản lượng FAQ nhưng chưa rõ nguyên nhân; xem báo cáo để quyết định chạy so sánh trực tiếp.

# Kế hoạch `feat/fact-slots-enable` — Cờ `cf.ai.fact_slots` + nối worker + EVAL `--fact-slots` (DRAFT-FACT-SLOTS PR 5)

## Việc

Mã gap matrix: `DRAFT-FACT-SLOTS` · ADR 017 · kế hoạch cha `docs/plans/feat-draft-fact-slots.md`.

**Tóm tắt (2–3 câu dễ hiểu):** Thêm cờ DB theo workspace `cf.ai.fact_slots` (mặc định TẮT, bật bằng `pnpm flags:set`); khi bật, worker nạp chính sách ĐÃ DUYỆT và câu trả lời đi đường fact plan (số/chính sách do code điền). Thêm `--fact-slots` cho EVAL để đo trước/sau. Sửa kèm: duyệt thay thế giữ nguyên id bản đã duyệt. Không cột/bảng/migration mới.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Cờ `cf.ai.fact_slots` mặc định TẮT (`FLAG_DEFAULTS`); worker chỉ truyền `factSlots` khi cờ bật cho workspace — kiểm bằng: typecheck + chạy EVAL/worker thật sau khi bật.
2. Duyệt thay thế giữ NGUYÊN id bản đã duyệt (chép data/evidence/source_ref, xóa nháp, rev tăng, dấu duyệt đóng lại) — kiểm bằng: `policy-facts.int.test.ts`.
3. EVAL `--fact-slots` ghi: số câu bị từ chối cứng, sự kiện bắt buộc biết/chưa biết, vi phạm tiền ở câu cuối, hành động, 10 câu mẫu — kiểm bằng: `slot-metrics.test.ts`; `slotDiagnostics` — `fact-slots.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

`apps/worker/src/jobs/pipeline-job.ts`, `apps/worker/src/main.ts`, `tools/eval/src/run-sample.ts`, `tools/eval/src/cli/run.ts`, `packages/shared/src/flag-keys.ts`.

## File sẽ sửa / tạo

Sửa: `flag-keys.ts` + `index.ts` (shared), `pipeline-job.ts`, `main.ts` (worker), `run-pipeline.ts` + `pipeline/index.ts` (`slotDiagnostics`), `queries/policy-facts.ts` (+ test), `tools/eval/src/{shop,run-sample,runner,cli/run}.ts`, `production/knowledge.ts`, `datasets/shops/*.json` (`policyFacts` do Owner khai báo). Tạo: `tools/eval/src/slot-metrics.ts` (+ test).

## Migration

Không.

## Test viết trước

Xem tiêu chí.

## Lệnh test phạm vi hẹp

`cd packages/db && npx vitest run --config vitest.int.config.ts tests/policy-facts.int.test.ts`; `pnpm --filter @flow/eval exec vitest run src/slot-metrics.test.ts`; `pnpm --filter @flow/ai exec vitest run src/pipeline/fact-slots.test.ts`.

# Kế hoạch `feat/pipe-orchestrator-c` — PIPE-ORCHESTRATOR lát C (chặn trước khi gọi LLM, trừ lượt idempotent)

**Trạng thái duyệt:** Đã duyệt (lát C của `docs/plans/feat-pipe-orchestrator.md`, chủ dự án duyệt 07/11/2026). **Lát C KHÔNG tự merge: gửi diff cho chủ dự án kiểm chéo trước khi merge** (chủ dự án chỉ đạo 07/11).

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (lát C), `USAGE-GATE-PIPE`, `EMERGENCY-STOP-WIRE` (mức đọc) · Spec: `docs/09` §4, §9; FR-090, FR-024; Q-POR3.

**Tóm tắt:** Dựng cổng chạy SAU lọc quy tắc và TRƯỚC mọi lời gọi LLM: (1) dừng khẩn cấp → chặn; (2) giành quyền xử lý bình luận + ghi khóa duy nhất theo `comment_id` + trừ lượt hạn mức trong CÙNG một giao dịch ngắn đã commit trước khi gọi LLM. Nhờ khóa duy nhất ở DB, mỗi bình luận chỉ trừ MỘT lượt dù job thử lại, chạy đồng thời hay crash giữa chừng. Hết lượt/hết lần thử → "Cần nhân viên", không kẹt `processing`. Rủi ro: đụng đếm lượt gói và dừng khẩn cấp (tiền/an toàn) nên cần kiểm chéo.

## Điểm chưa rõ

Không có. Quyết định: Q-POR5 (thuê chống trùng; lượt đã trừ không hoàn khi lỗi hệ thống).

## Tiêu chí nghiệm thu

1. Cổng chạy sau `ruleFilter`/che PII/chuẩn hóa và TRƯỚC `extract`; bị chặn → `extract`/`draft` KHÔNG được gọi — kiểm bằng: `run-pipeline.test.ts`, `pipeline-turn.int.test.ts` (đếm số lần gọi).
2. Dừng khẩn cấp → chặn `emergency_stop`, không giành quyền, không trừ lượt; lỗi đọc cờ → chặn `gate_error` (đóng khi lỗi); workspace không đọc được → coi là đang dừng — kiểm bằng: `turn-gate.test.ts`, `pipeline-turns.int.test.ts`, `pipeline-turn.int.test.ts`.
3. Hết hạn mức → `quota_exhausted`: KHÔNG trừ, khóa `blocked`, bình luận `needs_human`; hạn mức 0 → chặn ngay — kiểm bằng: `pipeline-turn.int.test.ts`.
4. Trừ lượt idempotent bằng khóa UNIQUE `comment_id`: thử lại sau khi đã trừ → xử lý tiếp, không trừ thêm; **crash sau consume trước persist**; lỗi giữa chừng khi trừ → hoàn tác cả khóa lẫn trạng thái (không khóa mồ côi) — kiểm bằng: `pipeline-turn.int.test.ts`.
5. Nhiều job đồng thời cùng bình luận → trừ đúng 1 lượt, đúng 1 dòng khóa, một job chạy tiếp, còn lại `busy` (không tăng lần thử, không gọi LLM trùng); thuê hết hạn thì giành lại; nhả thuê khi lỗi có kiểm soát — kiểm bằng: `pipeline-turns.int.test.ts`, `pipeline-turn.int.test.ts`.
6. Quá số lần thử → `attempts_exhausted`: bình luận `needs_human` (không kẹt `processing`), khóa `failed` — kiểm bằng: cùng file.
7. `charged_at` ghi MỘT lần (trigger DB chặn sửa/xóa); RLS: thành viên chỉ đọc, hệ thống ghi, workspace khác không thấy — kiểm bằng: `pipeline-turns.int.test.ts`, `pnpm db:check-rls`.
8. Bình luận bị `ruleFilter` bỏ (emoji…) KHÔNG giành quyền, KHÔNG trừ lượt (FR-024) — kiểm bằng: `pipeline-turn.int.test.ts`.
9. `pnpm precheck` xanh; gói `ai` coverage 100%; DB và worker tích hợp xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/saas-core/src/billing/usage-meter.ts`, `packages/db/src/usage-counters.ts` (`consumeUsage`), `migrations/0046_drafts.sql` (mẫu RLS), `apps/web/src/lib/ai-turn-limit.ts`, `packages/ai/src/pipeline/run-pipeline.ts`.

## File sẽ sửa / tạo

Migration `0073_pipeline_turns.sql` + journal; `packages/db/src/schema/cf/pipeline-turns.ts`, `queries/pipeline-turns.ts`, `check-rls.ts` (kỳ vọng quyền/policy); `packages/ai/src/pipeline/turn-gate.ts` (+test); `apps/worker/src/jobs/pipeline-turn.ts` (cổng DB, +test tích hợp); `packages/shared/src/ai-turn-limit.ts` (chuyển từ web, dùng chung) + web re-export; tài liệu: Q-POR5, docs/10, codemap, gap-matrix, handoff (kèm tự kiểm).

## Migration

`0073`: BẢNG MỚI `cf.pipeline_turns` (`comment_id` PK = khóa duy nhất theo bình luận, `workspace_id`, `charged_at` ghi-một-lần bằng trigger, `attempts`, `state`, `last_error`, `locked_until`, thời gian) có RLS bật + policy (đọc: thành viên/không người dùng; ghi: chỉ hệ thống) + quyền theo cột cho `cf_app`; FK tới `cf.comments` (cascade) và `core.workspaces` (cascade). Chỉ THÊM bảng mới, không đổi bảng cũ, không nới RLS; đường lùi: `DROP TABLE cf.pipeline_turns; DROP FUNCTION cf.guard_pipeline_turn_charged();`. Thuộc loại chỉ-thêm (Q-MRG2) nhưng lát này nhạy cảm nên VẪN chờ chủ dự án kiểm chéo.

## Test viết trước

Cổng thuần (thứ tự, đóng-khi-lỗi), DB (giành quyền, khóa duy nhất, lần thử, trigger, RLS, thuê), worker trên DB thật (trừ lượt idempotent, crash, đồng thời, hết lượt, dừng khẩn cấp, `runPipeline` không gọi LLM khi bị chặn).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/pipeline-turns.int.test.ts` · worker `tests/pipeline-turn.int.test.ts` · `pnpm db:check-rls` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

**Có — chủ dự án kiểm chéo diff trước khi merge** (đếm lượt gói, dừng khẩn cấp, bảng mới có RLS). Tự kiểm theo `verify.md` §A + §B ghi ở `docs/handoff/feat-pipe-orchestrator.md`, gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập".

## Rủi ro / câu hỏi cho chủ dự án

Xem mục "Điểm cần bạn nhìn kỹ" trong handoff (lượt đã trừ không hoàn khi lỗi hệ thống; thuê 120 giây; giao dịch trừ lượt giữ khóa dòng bộ đếm ngắn).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Thêm cơ chế "thuê" ngắn (cột `locked_until`) ngoài tối thiểu — cần vì job trùng đồng thời làm vượt trần lần thử và gọi LLM trùng (phát hiện bằng test đồng thời).

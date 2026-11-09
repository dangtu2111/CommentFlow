# Kế hoạch `feat/fact-qualitative` — Sự kiện định tính (enum) + chủ đề do extract trả + prompt/guard + ngôn ngữ (ADR 017, KHÔNG migration)

## Việc

Mã gap matrix: `DRAFT-FACT-SLOTS` · ADR 017 · quyết định đã khóa `docs/decisions/017-da-khoa.md` · kế hoạch cha `docs/plans/feat-draft-fact-slots.md`.

**Tóm tắt (2–3 câu dễ hiểu):** Sự kiện chính sách không có số (phí ship tính khi thanh toán, giao tới nước nào, hoàn tiền về đâu, ai trả phí ship khi trả hàng…) được lưu dạng ENUM trong `data` jsonb của 5 kind hiện có; code viết câu theo ngôn ngữ khách, nguyên văn chỉ là bằng chứng. Chủ đề câu hỏi do bước extract trả (enum, Zod) thay cho regex. Sửa prompt/guard chế độ chỗ giữ chỗ, nối ngôn ngữ trả lời (kênh → lượt trước → mặc định workspace) vào worker cùng đường với EVAL. Không migration/RLS/trigger/auth.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Zod: `feeMode/freeOverMinor/daysMode/destinations`, `refundTo/returnShippingPaidBy/eligibility`; known khi có giá trị định tính — kiểm bằng: `fact-plan/qualitative.test.ts`.
2. #294 rút enum từ văn bản; 7 câu sswiftly (06, 08–13) thành `answer` bằng sự kiện; hàng lỗi → chuyển người — kiểm bằng: `qualitative.test.ts`, `pipeline/fact-qualitative.test.ts`.
3. `extract` trả `topics` + `destination` (Zod); không còn regex đoán chủ đề — kiểm bằng: `classify/extract-result.test.ts`.
4. Guard chỗ giữ chỗ: từ chối cứng câu mời và tình trạng hàng LLM tự viết, không bắt nhầm ("available in black", "contact the carrier") — kiểm bằng: `fact-plan/slots.test.ts` (≥ 6 ca dương/âm).
5. Prompt: mã BẮT BUỘC, cấm hỏi thêm, nhãn tiếng Việt thay mã enum — kiểm bằng: `draft/draft-prompt.test.ts`, `draft/draft-slots.test.ts`.
6. Ngôn ngữ: kênh cố định thắng; kênh auto → lượt khách trước → mặc định workspace; "you" không lọt câu tiếng Việt — kiểm bằng: `pipeline/fact-slots.test.ts`, `packages/db/src/queries/pipeline-context-language.test.ts`, `apps/worker/tests/pipeline-job.int.test.ts`.
7. Mọi biến thể cùng giá → trả lời giá không hỏi biến thể — kiểm bằng: `pipeline/fact-slots.test.ts`.
8. EVAL: nhãn gold `factKinds` (chủ dự án cấp) được schema nhận, báo cáo tách tồn kho — kiểm bằng: `tools/eval` test.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/ai/src/pipeline/run-pipeline.ts`, `fact-plan/{plan,fill,suggest,slots,compose}.ts`, `draft/draft-prompt.ts`, `classify/extract-*.ts`, `packages/db/src/queries/pipeline-context.ts`, `apps/worker/src/jobs/pipeline-job.ts`.

## File sẽ sửa / tạo

Nhiều file trong `packages/ai/src/{fact-plan,pipeline,draft,classify}`, `packages/shared/src/policy-facts.ts`, `packages/db/src/queries/pipeline-context.ts` (+ test), `apps/worker/src/jobs/pipeline-job.ts` (+ test), `tools/eval/{src,datasets}`, `docs/decisions/017-da-khoa.md`, `docs/plans/quyet-dinh/q-adr017-da-khoa.md`, `docs/gap-matrix.md`.

## Migration

Không. (Chỉ ĐỌC thêm cột đã có: `cf.channels.reply_language`, `core.workspaces.default_lang`, `cf.comments.lang`.)

## Test viết trước

Xem tiêu chí.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/fact-plan src/pipeline src/draft src/classify`; `pnpm --filter @flow/db exec vitest run src/queries/pipeline-context-language.test.ts`; `cd apps/worker && npx vitest run --config vitest.int.config.ts tests/pipeline-job.int.test.ts`; `pnpm --filter @flow/eval exec vitest run`.

# Kế hoạch `feat-cost-gate` — COST-GATE (cổng chi phí AI)

## Việc

Mã gap matrix: `COST-GATE` · Spec: `docs/09_System_Architecture.md` §6 cổng 9 / §6.1 R7, docs/06 NFR-C1 (≤ $2/1.000 lượt), FR-071 (hạn mức tháng).

**Tóm tắt:** thêm "cổng chi phí" đứng trước mọi lần gọi LLM: đọc tổng chi tháng từ `ai_usage` và trần `workspaces.ai_cost_cap_usd`, cộng phần đang bay (đã đặt chỗ) + ước tính cho lần gọi này; nếu sẽ vượt trần thì **không gọi** (ném `COST_CAP_REACHED`), nên chi phí không bao giờ vượt hạn mức quá phần đang bay. Rủi ro: nhiều tiến trình cùng lúc có thể vượt nhẹ (chỉ bị chặn trong từng tiến trình) — ghi rõ, LiteLLM budget là lớp cứng thứ hai.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, xem Q-CG1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Không đặt trần (`null`) → cho gọi — kiểm bằng: test `FR-071 evaluateCostGate không trần`.
2. Đã chi ≥ trần → chặn `cap_reached`; chi + đang bay + ước tính > trần → chặn `would_exceed`; đúng bằng trần → cho — kiểm bằng: test ca biên (±1 phần nghìn đô).
3. Đầu vào hỏng (âm, NaN, Infinity) → chặn `invalid_input` (đóng khi không chắc) — kiểm bằng: test + property-based.
4. Property: với mọi (đã chi, đang bay, ước tính, trần) hữu hạn, cho ⇒ tổng ≤ trần; tăng chi tiêu không bao giờ biến "chặn" thành "cho" (đơn điệu) — kiểm bằng: fast-check.
5. Bọc client: bị chặn thì `fetch`/LLM KHÔNG được gọi và ném `AppError('COST_CAP_REACHED')`; cho thì gọi, đặt chỗ rồi nhả chỗ cả khi lỗi — kiểm bằng: test với client giả.
6. Gọi song song cùng workspace: đặt chỗ nguyên tử trong tiến trình, tổng chấp nhận ≤ trần — kiểm bằng: test `Promise.all`.
7. Sổ chi phí DB: tổng `ai_usage` từ đầu tháng UTC, chỉ workspace đó, đọc trần từ `workspaces` — kiểm bằng: test tích hợp `packages/ai/tests/cost-ledger.int.test.ts` (chạy được khi có DB) + test đơn vị mốc tháng.
8. Ngưỡng coverage `packages/ai` không hạ; `src/cost-gate/*.ts` ≥ 95% nhánh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`llm-client.ts` (điểm bọc), `gate/auto-send-gate.ts` (đầu vào cổng 9 đã có), `packages/shared/src/errors.ts`, schema `ai-usage.ts`/`tenancy.ts` (đã đọc), `vitest.config.ts`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/cost-gate/{cost-gate.ts,estimate.ts,reservations.ts,ledger.ts,gated-llm-client.ts}` + test cùng thư mục; `packages/ai/tests/cost-ledger.int.test.ts`.
- Sửa `packages/shared/src/errors.ts` (+`COST_CAP_REACHED` 402), `packages/ai/src/index.ts`, `packages/ai/vitest.config.ts` (thêm glob 95% cho `src/cost-gate/*.ts`), docs (codemap fragment, gap-matrix, MASTER, QUYET_DINH, KIEM_TRA_TAY).

## Migration

Không có (chỉ làn b). Phần cần bảng/cột mới → gap `COST-GATE-WIRE`/`COST-GATE-PERSIST`: nối vào worker/pipeline, trần mặc định theo gói (`plans`), bộ đếm Redis đa tiến trình, cảnh báo 80% gửi Owner.

## Test viết trước

Toàn bộ `cost-gate.test.ts`, `reservations.test.ts`, `gated-llm-client.test.ts`, `estimate.test.ts` viết đỏ trước khi có mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/cost-gate` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chặn chi phí/hạn mức, đọc `workspaces`/`ai_usage` qua `withWorkspace`).

## Rủi ro / câu hỏi cho chủ dự án

Vượt nhẹ khi nhiều tiến trình (ghi ở Q-CG1). Không có câu hỏi chặn.

## Đề xuất thay đổi

Sau này: trần mặc định theo gói + cột `plans.ai_cost_cap_usd` (migration làn b).

## Complexity tracking

Không có. (`fast-check` đã cài sẵn ở `packages/ai`.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec hoặc ghi ở Q-CG1).

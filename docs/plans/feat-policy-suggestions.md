# Kế hoạch `feat/policy-suggestions` — Đề xuất chính sách có cấu trúc từ Shopify/văn bản + duyệt kèm phiên bản (DRAFT-FACT-SLOTS PR 3)

## Việc

Mã gap matrix: `DRAFT-FACT-SLOTS` · ADR 017 · kế hoạch cha `docs/plans/feat-draft-fact-slots.md` (PR 3 theo thứ tự đã duyệt). PR 1 (#291) và PR 2 (#293) đã merge.

**Tóm tắt (2–3 câu dễ hiểu):** Mỗi lần đồng bộ Shopify, hệ thống đọc văn bản chính sách (ship, đổi trả, bảo hành, COD) và tạo BẢN NHÁP có cấu trúc kèm nguyên văn câu làm bằng chứng; Owner duyệt mới vào câu trả lời. Việc đọc chỉ nhận số xuất hiện nguyên văn trong câu, câu mơ hồ thì bỏ (không đoán). Kèm hai chỉnh theo kiểm chéo #293: duyệt có kiểm phiên bản (`rev`) và duyệt thay thế trong một giao dịch.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Duyệt kèm `rev` Owner đang xem: `rev` lệch (worker vừa làm mới nháp) → `stale`, không duyệt, nháp giữ nguyên; xem lại rev mới thì duyệt được — kiểm bằng: `policy-facts.int.test.ts` ("duyệt kèm rev").
2. Duyệt lần đầu và duyệt thay thế (đã có bản approved cùng kind/slot) trong MỘT giao dịch, không lỗi unique, chỉ còn một bản approved — kiểm bằng: cùng test.
3. `suggestPolicyFacts`: số trong `data` có nguyên văn trong câu bằng chứng; ngưỡng/miễn phí có điều kiện/hai số khác nhau/tỉnh không rõ kiểu/hai câu mâu thuẫn → bỏ; mọi đề xuất qua Zod — kiểm bằng: `fact-plan/suggest.test.ts`.
4. `refreshPolicySuggestions`: tạo nháp; đồng bộ lại cùng nội dung KHÔNG tăng `rev`; trùng hệt bản đã duyệt → không tạo nháp; nháp hết được đề xuất → xóa; không đụng bản đã duyệt/nháp nguồn khác — kiểm bằng: test tích hợp cùng file.
5. Lỗi đề xuất không làm hỏng việc nạp sản phẩm/chính sách — kiểm bằng: `apps/worker/src/jobs/shopify-sync.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/db/src/queries/policy-facts.ts`, `apps/worker/src/jobs/shopify-sync.ts` (+ test), `packages/shared/src/policy-facts.ts` (Zod), `packages/ai/src/fact-plan/regions.ts` (tên tỉnh).

## File sẽ sửa / tạo

Tạo: `packages/ai/src/fact-plan/suggest.ts` (+ test). Sửa: `packages/db/src/queries/policy-facts.ts` (duyệt kèm rev, `refreshPolicySuggestions`, không cập nhật khi không đổi), `packages/db/src/runtime.ts`, `packages/ai/src/fact-plan/index.ts`, `apps/worker/src/jobs/shopify-sync.ts` (+ test), `packages/db/tests/policy-facts.int.test.ts`.

## Migration

Không.

## Test viết trước

Test tích hợp và đơn vị viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/fact-plan/suggest.test.ts`; `cd packages/db && npx vitest run --config vitest.int.config.ts tests/policy-facts.int.test.ts`; `pnpm --filter @flow/worker exec vitest run src/jobs/shopify-sync.test.ts`.

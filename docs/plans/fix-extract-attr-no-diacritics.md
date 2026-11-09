# Kế hoạch `fix/extract-attr-no-diacritics` — Bổ sung size/màu khách đã nêu (tiếng Việt không dấu) bằng code

## Việc

Mã gap matrix: nhóm "tách size/màu không dấu" (viplain-03) · ADR 017. Khóa 3 (không thêm kind) và khóa 6 (chữ số chỉ qua `customer_measure`) giữ nguyên.

**Tóm tắt (2–3 câu dễ hiểu):** Khách không dấu viết "ao thun basic L trang con ko a" mà bước nhận diện (LLM) bỏ sót size/màu nên hệ thống hỏi lại thừa. Sau khi đã khớp đúng MỘT sản phẩm, code so từng từ trong câu với các giá trị size/màu của CHÍNH sản phẩm đó (bỏ dấu, không đồng nghĩa) và chỉ nhận khi đúng một giá trị khớp. Rủi ro: nhận nhầm size một chữ cái ("m" = "mình") — chặn bằng quy tắc size một chữ cái phải viết HOA hoặc đứng sau "size/sz/cỡ".

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `inferAttrsFromText`: "ao thun basic L trang" → size l, color white; hai màu cùng nhắc → color null; sản phẩm không có trục → không đổi; không ghi đè giá trị extract đã có — kiểm bằng: `pipeline/attr-from-text.test.ts`.
2. Pipeline: viplain-03 ("ao thun basic L trang con ko a") → answer có `{fact:stock.1}`; chỉ nêu màu → vẫn hỏi lại size — kiểm bằng: `fact-slots.test.ts`.
3. Đo `fs-q9`: demo ≥ 34/37, sự kiện ≥ 33/36, dự phòng < 5%, `reply_empty`/FR-142/lưới = 0, viplain-03 answer, nhóm không dấu tách size ≥ 4/5, màu 5/5, sự kiện ≥ 11/12.

## File sẽ đọc

`packages/ai/src/pipeline/run-pipeline.ts` (resolve sản phẩm, `variantAttrs`), `packages/ai/src/try/db-product-knowledge.ts` (`toPlanProduct`, `attrsNorm`), `packages/ai/src/classify/extract-result.ts`, `packages/shared/src/products.ts` (`normalizeAttrs`).

## File sẽ sửa / tạo

Tạo: `packages/ai/src/pipeline/attr-from-text.ts` (+ test). Sửa: `packages/ai/src/pipeline/run-pipeline.ts` (`withInferredAttrs` sau khi khớp sản phẩm; `result.extract` mang size/màu đã bổ sung), `packages/ai/src/pipeline/fact-slots.test.ts`, `tools/eval/src/run-sample.ts` (ảnh chụp extract phản ánh size/màu cuối), `docs/plans/quyet-dinh/q-adr017-attr.md`.

## Migration

Không.

## Test viết trước

Đơn vị và pipeline viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline/attr-from-text.test.ts src/pipeline/fact-slots.test.ts`

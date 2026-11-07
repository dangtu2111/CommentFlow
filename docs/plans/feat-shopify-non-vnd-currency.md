# Kế hoạch `feat/shopify-non-vnd-currency` — tiền tệ khác VND (Bước 3b lõi AI)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt 07/11/2026 trong kế hoạch Bước 3: "xử lý tiền tệ khác VND: để giá trống, cảnh báo Owner, AI chuyển hướng, không quy đổi, ghi QUYET_DINH").

## Việc

Mã gap matrix: `SHOPIFY-FOREIGN-PRICE` (mới) · Spec: FR-052, FR-129, nguyên tắc #4.

**Tóm tắt:** Cửa hàng Shopify dùng USD/EUR… hiện được đồng bộ với giá trống nhưng Owner không được báo và AI có thể trả lời câu hỏi giá bằng "chưa có giá". Nhánh này (1) báo Owner trên thẻ Shopify, (2) làm AI chuyển hướng cho nhân viên khi khách hỏi giá mà sản phẩm chưa có giá, không quy đổi tỷ giá. Rủi ro thấp: thêm cảnh báo + chặn trả lời; không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Đồng bộ cửa hàng khác VND ghi `currencyUnsupported` (3 chữ cái hoa hoặc `OTHER`) + `variantsWithoutPrice`; VND không ghi gì — kiểm bằng: `shopify-sync.test.ts`.
2. Thẻ Shopify hiện cảnh báo (vi/en) chỉ khi có `currencyUnsupported` hợp lệ; dữ liệu hỏng bỏ qua — kiểm bằng: `shopify-currency.test.ts`, `pnpm lint:i18n`.
3. Hỏi giá + sản phẩm chưa có giá → `redirect` (chủ đề chưa nguồn), không tự gửi; hỏi tồn kho cùng sản phẩm vẫn `answer`; sản phẩm có giá không đổi — kiểm bằng: `try-pipeline.test.ts`.
4. Nguồn sản phẩm đánh dấu `priceUnknown` khi không có giá nào — kiểm bằng: `db-product-knowledge.wiring.test.ts`.
5. `pnpm precheck` xanh; gói `ai` coverage 100% lines/functions.

## File sẽ đọc (≤ ~8, kèm lý do)

`apps/worker/src/jobs/shopify-sync.ts`, `packages/db/src/shopify-store.ts`, `apps/web/src/components/kb/shopify-card.tsx`, `packages/ai/src/try/{try-pipeline,db-product-knowledge}.ts`.

## File sẽ sửa / tạo

`apps/worker/src/jobs/shopify-sync.ts` (+test), `packages/db/src/shopify-store.ts` (kiểu), `apps/web/src/lib/shopify-currency.ts` (+test mới), `components/kb/shopify-card.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json`, `packages/ai/src/try/{try-pipeline,db-product-knowledge}.ts` (+test); tài liệu: Q-SNV1, gap-matrix, codemap, handoff.

## Migration

Không có (tóm tắt đồng bộ là jsonb).

## Test viết trước

Cảnh báo tiền tệ ở job, hàm trợ giúp hiển thị, ba ca pipeline, cờ `priceUnknown`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/worker exec vitest run src/jobs/shopify-sync.test.ts` · `pnpm --filter @flow/web exec vitest run src` · `pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm lint:i18n` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Không: không auth/RLS/migration/cổng tự gửi; thay đổi chỉ làm AI chuyển hướng nhiều hơn (an toàn hơn) cho ca không có giá.

## Rủi ro / câu hỏi cho chủ dự án

Chưa có cách nhập tay giá thay thế cho shop dùng tiền tệ khác VND (ngoài phạm vi lát này).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

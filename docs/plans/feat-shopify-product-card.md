# Kế hoạch `feat/shopify-product-card` — thẻ sản phẩm từ Shopify (Bước 3a lõi AI)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt 07/11/2026: "brand_voice → metafield Shopify → PIPE-ORCHESTRATOR + drafts"; Bước 3 trong kế hoạch: Shopify description/metafield FR-058). Phần tiền tệ khác VND làm ở nhánh kế tiếp.

## Việc

Mã gap matrix: `SHOPIFY-PRODUCT-CARD` (mới) · Spec: FR-058, FR-052, nguyên tắc #4.

**Tóm tắt:** Đồng bộ Shopify chưa lấy mô tả/tag/metafield nên AI không trả lời được "chất liệu gì", "giặt thế nào", "xuất xứ". Nhánh này lấy chúng vào `products.card` (cột jsonb có sẵn, không migration) và đưa vào câu nguồn của AI, đồng thời loại mọi câu có số tiền để AI không trích giá cũ. Rủi ro: metafield đọc được hay không phụ thuộc quyền cửa hàng — cần thử trên shop thật.

## Điểm chưa rõ

Không có (khóa metafield chấp nhận danh sách cố định ở Q-SPC1; thêm khóa = một dòng).

## Tiêu chí nghiệm thu

1. `buildShopifyCard`: loại/tag/mô tả/metafield `custom.*` → thẻ; namespace/kiểu khác bỏ; rich text → chữ thuần; câu có số tiền bị loại; ≤ 600 ký tự — kiểm bằng: `card.test.ts`, `products.test.ts` (`cleanCardText`).
2. Connector đọc `description/tags/metafields` (chỉ query), thiếu trường → mặc định rỗng không làm hỏng đồng bộ — kiểm bằng: `connector.test.ts`.
3. `buildShopifyImportPlan` đưa `card` vào kế hoạch; giá trong mô tả không thành giá sản phẩm — kiểm bằng: `normalize.test.ts`.
4. Ghi đồng bộ GỘP thẻ (khóa nguồn thắng, khóa khác giữ, không có thẻ → giữ nguyên) — kiểm bằng: `product-source-sync.int.test.ts` (DB thật).
5. `loadTryProducts` trả thẻ hợp lệ, bỏ thẻ hỏng — kiểm bằng: `product-source-sync.int.test.ts`.
6. Câu nguồn sản phẩm có "Chi tiết: …", đã làm sạch lại, không thẻ → như cũ — kiểm bằng: `db-product-knowledge.test.ts`.
7. `pnpm precheck` xanh; gói `ai` coverage 100% lines/functions.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/connectors/src/shopify/{connector,normalize}.ts`, `packages/shared/src/{products.ts,product-import/plan.ts}`, `packages/db/src/queries/{product-source-sync,try-products}.ts`, `packages/ai/src/try/db-product-knowledge.ts`.

## File sẽ sửa / tạo

`connectors/src/shopify/{card.ts(+test mới),connector.ts,normalize.ts}` (+test); `shared/src/{products.ts,index.ts,product-import/plan.ts}` (+test); `db/src/queries/{product-source-sync,try-products}.ts` + `db/tests/product-source-sync.int.test.ts`; `ai/src/try/db-product-knowledge.ts` (+test); tài liệu: `docs/05` FR-058, Q-SPC1, gap-matrix, codemap, handoff.

## Migration

Không có (dùng cột `products.card` jsonb sẵn có).

## Test viết trước

Bộ dựng thẻ, làm sạch số tiền, connector, kế hoạch nhập, ghi gộp (DB thật), câu nguồn.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/shopify` · `pnpm --filter @flow/shared exec vitest run src/products.test.ts` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/product-source-sync.int.test.ts` · `pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Không: không auth/RLS mới/migration/cổng tự gửi; thêm văn bản vào nguồn của AI nhưng đã có bộ chặn số tiền + làm sạch hai lớp. Ghi `card` đi qua `withActor`/`withJob` sẵn có.

## Rủi ro / câu hỏi cho chủ dự án

Cần đồng bộ thử trên shop Shopify thật để xác nhận metafield `custom.*` đọc được với quyền hiện có.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.

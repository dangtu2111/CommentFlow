# Kế hoạch `feat/shopify-foreign-price` — báo giá theo tiền tệ gốc của cửa hàng (Q-SFP1)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt 07/11/2026: "cứ trả lời theo giá của thông tin, không cần đổi đơn vị tiền tệ" — thay Q-SNV1).

## Việc

Mã gap matrix: `SHOPIFY-FOREIGN-PRICE` (mới, thay `SHOPIFY-NON-VND`) · Spec: FR-052, FR-129, nguyên tắc #4.

**Tóm tắt:** Shop Shopify dùng USD hiện bị bỏ trống giá và AI chuyển hướng. Theo chỉ đạo, AI phải báo đúng giá của cửa hàng theo tiền tệ gốc (vd. "12.99 USD"), không quy đổi. Vì mọi nơi khác (giao diện, kiểm giá lúc gửi, quy tắc giá) chỉ hiểu VND, giá ngoại tệ lưu ở cột riêng và chỉ đường trả lời của AI đọc; câu có báo giá ngoại tệ không tự gửi cho tới khi kiểm giá lúc gửi hỗ trợ. Rủi ro: có migration (chỉ thêm) và thay đổi cách AI báo giá.

## Điểm chưa rõ

Không có (đã chọn: giá hiển thị `12.99 USD`; câu ngoại tệ không tự gửi — ghi ở Q-SFP1, đảo ngược được).

## Tiêu chí nghiệm thu

1. `parseDecimalMinor`/`formatMinorAmount`/`currencyExponent`: đọc chính xác (không số thực), từ chối sai dạng/quá độ chính xác, định dạng đúng theo tiền tệ — kiểm bằng: `foreign-money.test.ts`.
2. Kế hoạch nhập Shopify: khác VND → cột VND null, `currencyCode` + `priceMinor`/`compareAtMinor` (thấp nhất ở cấp sản phẩm); VND không đổi — kiểm bằng: `normalize.test.ts`.
3. Ghi đồng bộ lưu/ghi đè/đặt lại (USD ↔ VND) trên DB thật — kiểm bằng: `product-source-sync.int.test.ts`.
4. Câu nguồn sản phẩm nêu giá đúng tiền tệ gốc, không bịa khi hỏng; nguồn đánh dấu `foreignPrice` — kiểm bằng: `db-product-knowledge*.test.ts`.
5. Hỏi giá sản phẩm USD → `answer` bằng giá nguồn, bộ chặn số tiền không bắt, câu "quy đổi" ra đồng bị bắt, tự gửi bị chặn `foreign_price` — kiểm bằng: `try-pipeline.test.ts`, `auto-send-preview.test.ts`.
6. Trang Shopify hiện thông báo trung tính khi khác VND; dữ liệu hỏng bị bỏ qua — kiểm bằng: `shopify-currency.test.ts`, `pnpm lint:i18n`.
7. `pnpm precheck` xanh (gồm `check:migrations`); gói `ai` coverage 100%.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/db/src/schema/cf/products.ts`, `migrations/0034/0068`, `packages/connectors/src/shopify/normalize.ts`, `packages/db/src/queries/{product-source-sync,try-products}.ts`, `packages/ai/src/try/{db-product-knowledge,try-pipeline,auto-send-preview}.ts`.

## File sẽ sửa / tạo

Migration `0070_products_foreign_price.sql`, `0071_products_foreign_price_grants.sql` + journal; schema `products.ts`; `shared/src/foreign-money.ts` (+test mới), `product-import/plan.ts`; `connectors/src/shopify/normalize.ts`; `db/src/queries/{product-source-sync,try-products}.ts`, `shopify-store.ts`; `ai/src/try/{db-product-knowledge,try-pipeline,auto-send-preview}.ts` (+test); `worker/src/jobs/shopify-sync.ts`; web: `lib/shopify-currency.ts`, `components/kb/shopify-card.tsx`, i18n vi/en; tài liệu: Q-SFP1, docs/10, gap, codemap, handoff.

## Migration

0070: ADD COLUMN `currency_code text NOT NULL DEFAULT 'VND'` (CHECK 3 chữ hoa), `price_minor bigint`, `compare_at_minor bigint` (CHECK ≥ 0) trên `cf.products` và `cf.product_variants` — CHỈ THÊM, có mặc định/NULL, tương thích ngược; RLS không đổi. 0071: GRANT INSERT/UPDATE theo CỘT trên đúng các cột mới cho `cf_app` (cùng vai trò đang ghi). Đường lùi: DROP COLUMN / REVOKE (ghi trong đầu file). Theo Q-MRG2: thuộc loại tự merge khi CI xanh.

## Test viết trước

Bộ tiền tệ (39 ca), kế hoạch nhập, ghi DB thật, câu nguồn, pipeline ba ca, lý do chặn, job và thông báo.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/foreign-money.test.ts` · `pnpm --filter @flow/connectors exec vitest run src/shopify` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/product-source-sync.int.test.ts` · `pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Tự kiểm theo `verify.md` §A/B: diff chạm giá (nguyên tắc #4) nhưng chỉ THÊM đường báo giá có nguồn và CHẶN tự gửi cho câu ngoại tệ; không nới RLS/auth. Gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập".

## Rủi ro / câu hỏi cho chủ dự án

Khi dựng PIPE-ORCHESTRATOR cần làm `sendRecheck` R5 đọc giá ngoại tệ thì mới bỏ được chặn `foreign_price`. Giao diện danh sách sản phẩm chưa hiện giá ngoại tệ.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào; thêm cột thay vì tái dùng `price_vnd` để tránh sai ở các nơi đọc giá VND.

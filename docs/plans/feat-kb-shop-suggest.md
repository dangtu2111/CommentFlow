# Kế hoạch `feat/kb-shop-suggest` — PR5 của KB-SHOP-V2: đề xuất điền "Thông tin cửa hàng" từ Shopify và văn bản thô

## Việc

Mã gap matrix: KB-SHOP-V2 (PR5, theo `docs/plans/feat-kb-shop-v2.md`). PR3 (bảng `shop_profile_suggestions`, migration 0085) và PR4 (form trường mới) đã vào `main`.

**Tóm tắt (2–3 câu dễ hiểu):** Hệ thống tự gợi ý giá trị cho các ô của trang Thông tin cửa hàng: từ Shopify (tên, email liên hệ, tên miền, mô tả, địa chỉ) và từ đoạn văn thô shop đã nhập (tên, khẩu hiệu, mô tả, địa chỉ, giờ mở cửa, pháp lý do AI chắt lọc; hotline, email, website, Zalo, Shopee, TikTok do CODE tách bằng regex, không gửi AI). Gợi ý chỉ là BẢN NHÁP hiện dưới từng ô kèm nguồn và trích dẫn nguyên văn; chỉ Owner bấm Áp dụng (ghi vào ô) hoặc Bỏ. Rủi ro: gợi ý sai bị Owner áp dụng nhầm — nên luôn kèm trích dẫn, không bao giờ tự ghi đè; bước AI nằm sau cờ `cf.ai.distill` (mặc định tắt) và trong trần 0,20 USD/lần.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Hệ thống chỉ chèn NHÁP; chạy lại làm mới nháp (không nhân đôi); không đề xuất lại giá trị đã Bỏ/đã Áp dụng hay trùng hồ sơ hiện có; khác workspace không thấy.
2. Owner Áp dụng ghi đúng ô (hotline/email nối vào "Liên hệ công khai", Zalo/Shopee/TikTok vào `contacts`, thiếu hồ sơ chỉ `name` tạo được hồ sơ); Bỏ không đổi hồ sơ; Staff không quyết được; quyết lại → `not_found`.
3. Shopify: đọc `shop { name contactEmail primaryDomain description billingAddress }`; thiếu quyền/lỗi chỉ ghi `shopSuggestionsSkipped` và cảnh báo mã lỗi, KHÔNG làm hỏng việc nạp sản phẩm.
4. Văn bản thô: mục `shop_field` (name/slogan/description/address/opening_hours/legal_name/tax_id) qua kiểm cứng (trích nguyên văn, chữ số trong trích dẫn, không số tiền, ≤ 500 ký tự), KHÔNG thành FAQ; liên hệ tách bằng regex trên văn bản gốc, không gửi LLM; mã số thuế không bị nhận là hotline.
5. Giao diện: dưới mỗi ô hiện "Đề xuất từ Shopify / từ đoạn <tiêu đề>" + trích dẫn + nút Áp dụng/Bỏ; chỉ Owner thấy trang.
6. EVAL demo 1 lượt (cờ tắt) không thấp hơn cơ sở, chi phí < 1 USD, ghi sổ `eval-spend-ledger`.

## File sẽ đọc / sửa

Đọc: `packages/shared/src/shop-profile.ts`, migration 0085, `packages/ai/src/kb-distill/*`, `packages/connectors/src/shopify/connector.ts`, `apps/worker/src/jobs/shopify-sync.ts`, `kb-distill.ts`, `shop-sections.tsx`.
Thêm: `packages/shared/src/shop-suggestions.ts` (+test), `packages/db/src/queries/shop-suggestions.ts` (+int test), `apps/web/.../kb/shop-suggestion-actions.ts` (+test), `shop-sections.test.tsx`.
Sửa: `packages/ai/src/kb-distill/{schema,distiller,verify,run-distill,index}.ts`, `packages/connectors/src/shopify/connector.ts`, `packages/db/src/queries/kb-distill.ts`, `shopify-store.ts`, `runtime.ts`, `apps/worker/src/jobs/{shopify-sync,kb-distill}.ts`, `apps/web/.../kb/shop/page.tsx`, `actions.ts`, `components/kb/{shop-sections,kb-content-ui}.tsx`, i18n `vi/en`.

## Migration

Không (bảng, RLS, trigger đã có từ 0085).

## Test viết trước

`shop-suggestions.test.ts` (regex tách liên hệ, ánh xạ Shopify, nối liên hệ), `shop-suggestions.int.test.ts` (6 ca RLS/Áp dụng/Bỏ/không đề xuất lại/nhân ngôn ngữ), `shop-suggestion-actions.test.ts`, `shop-sections.test.tsx`, `kb-distill.test.ts` (shop_field), `connector.test.ts` (fetchShop), `shopify-sync.test.ts` (bước đề xuất không làm hỏng việc nạp).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-distill` · `pnpm --filter @flow/connectors exec vitest run src/shopify` · `pnpm --filter @flow/worker exec vitest run src/jobs` · `pnpm --filter @flow/web test` · `pnpm --filter @flow/db test:db tests/shop-suggestions.int.test.ts` · EVAL: `pnpm run evaluate --dataset datasets/synthetic-v2-demo-shop.jsonl --shop datasets/shops/demo-shop.json --repeats 1`.

## Cần kiểm chứng độc lập không?

Không: không đụng auth/RLS/migration/cổng tự gửi/che PII. Bước tách liên hệ chạy trên văn bản gốc nhưng tại chỗ trong tiến trình, không ghi log, không gửi ra ngoài; bước AI vẫn gửi bản đã che PII như cũ.

## Rủi ro / câu hỏi cho chủ dự án

- Prompt chắt lọc đổi `distill@1` → `distill@2` (thêm loại `shop_field`); ảnh hưởng chất lượng FAQ chắt lọc khi bật `cf.ai.distill` — cần đo lại M3 trên Shop Thử 2 trước khi bật rộng (EVAL demo 1 lượt chỉ đo đường trả lời, cờ tắt).
- Tên trường và quyền đọc `shop` theo tài liệu shopify.dev, CHƯA kiểm với cửa hàng thật; xem `docs/can-ban-cung-cap.d/kb-shop-shopify-scope.md`.
- Một (ngôn ngữ, trường, nguồn) chỉ giữ một nháp: nhiều đoạn cùng nêu một trường thì lần chạy sau thay nháp cũ.
- Hotline/email áp dụng vào ô "Liên hệ công khai" (chung một ô, ≤ 200 ký tự); quá dài → thông báo `too_long`, không ghi.

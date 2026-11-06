# Bàn giao — nhánh `feat-shopify-import`

Cập nhật: 06/11/2026 · Mục gap matrix: SHOPIFY-IMPORT · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-shopify-import.md`

## Đã làm
- Connector Shopify chỉ đọc (`packages/connectors/src/shopify/`): GraphQL phân trang con trỏ, biến thể > 25 lấy tiếp, chờ theo `throttleStatus`, `THROTTLED`/429 → `RATE_LIMIT`, chống SSRF (domain `*.myshopify.com`, `redirect:'error'`).
- Chuẩn hóa → `ImportProductPlan` (giá chỉ VND, tồn chỉ tracked); `verifyShopifyWebhook`; `readShopifyConfig` (shared); `applyProductSourceSync` (db, chưa chạy test tích hợp ở làn c).
- Docs: Q-SHI1, cbcc, KT-SHI, codemap, MASTER/gap-matrix; env.example.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/db/src/queries/product-import.ts` | Hàm Excel tôn trọng `locked_fields`; nguồn ngoài thì ghi đè nên có hàm riêng. |
| `packages/shared/src/product-import/plan.ts` | Kiểu `ImportProductPlan` dùng chung cho mọi nguồn. |
| Shopify | Trần 1.000 điểm/truy vấn → 25 sản phẩm × 25 biến thể. |

## Quyết định đã chốt trong phiên
- Q-SHI1 (docs/plans/quyet-dinh/qshi1.md).

## Còn lại (theo thứ tự)
1. `SHOPIFY-CONNECT-STORE` (làn b): migration bảng kết nối cửa hàng + token mã hóa, OAuth cài app, job worker gọi `fetchCatalog` → `buildShopifyImportPlan` → `applyProductSourceSync`.
2. Chạy `CF_LANE=b pnpm test:db` cho `packages/db/tests/product-source-sync.int.test.ts` (chưa chạy được ở làn c).
3. Route webhook + đối soát (`SHOPIFY-RECONCILE`); chính sách → `kb_chunks`; bulk operation cho shop lớn; kiểm với dev store thật (tên trường, phiên bản API).

## Lệnh test liên quan
```
pnpm --filter @flow/connectors exec vitest run src/shopify
pnpm --filter @flow/shared exec vitest run src/shopify-config.test.ts
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/product-source-sync.int.test.ts   # cần DB
```

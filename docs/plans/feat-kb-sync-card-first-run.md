# Kế hoạch `feat/kb-sync-card-first-run` — Thẻ sản phẩm vào kiến thức, tự xếp job, đồng bộ lần đầu

Mã gap matrix: `KB-SYNC-DRAFT` · Spec: KB-CHUNKING, KB-PUBLISH-VERSION. Tiếp theo `docs/plans/feat-kb-policy-sync.md` (#280, đã merge).

**Tóm tắt:** Chủ dự án chỉ ra Q-KSD1 sai: `products.card` (FR-058) có chất liệu/size/mô tả/tag. Việc này đưa thẻ vào đoạn kiến thức của sản phẩm (không giá/tồn), tự xếp job đồng bộ khi nhập Excel hoặc đồng bộ Shopify xong, và thêm nút/lệnh để đồng bộ lần đầu rồi Owner bấm Xuất bản. Rủi ro thấp: chỉ ghi bản nháp, không migration.

## Điểm chưa rõ

Không có (chủ dự án đã chốt yêu cầu 08/11/2026: card vào tài liệu sản phẩm, không giá/tồn; Excel/Shopify tự xếp job; nút trang Xuất bản kiểm Owner + lệnh dev, chạy cho Shop Thử 2).

## Tiêu chí nghiệm thu

1. Đoạn sản phẩm chứa chất liệu/bảng size/mô tả/tag từ card, gắn `product_id`, header "Sản phẩm › tên", không chứa giá/tồn — kiểm bằng: test đơn vị `source-documents.test.ts` + tích hợp `kb-sync.int.test.ts`.
2. Đồng bộ Shopify thành công và nhập Excel đều xếp job `kb-sync` (gộp 10 giây); chưa kết nối thì không — kiểm bằng: `shopify-sync.int.test.ts`.
3. Nút "Đồng bộ kiến thức" chỉ Owner; lệnh `kb:sync` báo số đoạn theo loại, số đoạn có vector và mâu thuẫn, từ chối staging/production — kiểm bằng: chạy lệnh cho Shop Thử 2 + KT-KBSYNC.

## File sẽ đọc / sửa

Đọc: `packages/shared/src/products.ts` (card), `packages/ai/src/try/db-product-knowledge.ts`, `apps/worker/src/jobs/shopify-sync.ts`, `apps/web/.../products/import/actions.ts`. Sửa: `packages/ai/src/kb-sync/source-documents.ts`, `packages/db/src/queries/kb-sync.ts`, `apps/worker/src/{jobs/kb-sync.ts,jobs/shopify-sync.ts,main.ts,cli/kb-sync.ts}`, `apps/web/.../kb-publish/{actions,page}.tsx`, i18n vi/en, docs.

## Migration

Không có.

## Test viết trước

Thẻ sản phẩm vào tài liệu (loại câu có số tiền), hook Shopify.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-sync` · `pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/kb-sync.int.test.ts tests/shopify-sync.int.test.ts`

## Cần kiểm chứng độc lập không?

Không (không đổi RLS/migration; ghi bản nháp đã kiểm chéo ở #280).

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Trạng thái duyệt

Đã duyệt (yêu cầu của chủ dự án 08/11/2026).

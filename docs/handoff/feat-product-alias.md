# Bàn giao — nhánh `feat-product-alias`

Cập nhật: 2026-11-06 · Mục gap matrix: PRODUCT-ALIAS · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-product-alias.md` · Quyết định: Q-PA1

## Đã làm
- `packages/shared/src/product-alias.ts` (+ test): `parseProductAlias` (cắt/gộp khoảng trắng, `aliasNorm` bằng `normalizeSearchText`, nguồn), `ALIAS_MATCH_THRESHOLD = 0,6`.
- Migration 0043 `cf.product_aliases`: FK ghép, unique `(workspace_id, alias_norm, product_id)`, GIN trigram, RLS (SELECT thành viên/không người dùng; INSERT/DELETE thành viên hoặc hệ thống; `confirmed_by` = người ghi; `ai_suggested` cần người xác nhận), không UPDATE.
- `packages/db/src/queries/product-aliases.ts`: tạo/liệt kê/xóa + `searchProductsByAlias`; `findProductMatch` thử bí danh trước (`matched`/`ambiguous` thì dừng, `none` thì rơi về tên/SKU).
- `check-rls.ts`: kỳ vọng cho bảng mới. Test tích hợp: `packages/db/tests/product-aliases.int.test.ts`.

## Đã đọc và rút ra
- `abbreviations` (0041) là mẫu RLS/GRANT; `products` (0034) là mẫu ghi theo thành viên.
- `expectRejectCode` trong `tests/helpers.ts` trả mã lỗi (không tự khẳng định).
- Làn này không có DB (`pnpm test:db` lỗi khởi động) → test tích hợp chỉ chạy ở CI; SQL đã được verifier-db đọc.
- `pnpm lint` đỏ sẵn ở file của người khác (`extract-result.test.ts`, `globals.css`), không thuộc nhánh này.

## Còn lại
- API `/products/:id/aliases`, tab "Bí danh" (UI), bảng gợi ý chờ xác nhận + `/aliases/suggestions`, nhập `source=import`.
- Cập nhật `products.search_text` kèm bí danh khi đổi; nối `resolveProducts` ở pipeline (`PIPE-RETRIEVE`).
- verifier-db (một lần): "Chặn merge" — kỳ vọng policy UPDATE (`w`) của check-rls cho bảng không có UPDATE → đã bỏ. Không chặn: GIN trigram chưa có tiền tố workspace_id (chấp nhận, bảng nhỏ); invariant ai_suggested chỉ do RLS (đã ghi trong migration); bên gọi phải mở rộng viết tắt trước khi tìm; deploy migrate trước code.

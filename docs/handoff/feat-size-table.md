# Bàn giao — nhánh `feat-size-table`

Cập nhật: 2026-11-06 · Mục gap matrix: SIZE-TABLE · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-size-table.md` · Quyết định: Q-ST1

## Đã làm
- `packages/shared/src/size-chart.ts` (+ test): `parseSizeChartRow` (size in hoa, đúng một sản phẩm/danh mục, ≥ 1 cận, min ≤ max, `categoryNorm`), `decideSize` (size / hỏi lại / mời ib `between_sizes`|`out_of_range`|`no_chart` + `recordGap`).
- Migration 0044 `cf.size_charts`: CHECK phạm vi + cận, unique một phần (sản phẩm / danh mục), FK ghép, RLS (đọc thành viên/không người dùng; ghi Owner hoặc hệ thống), GRANT UPDATE không gồm cột phạm vi.
- `packages/db/src/queries/size-charts.ts`: tạo/sửa/xóa/liệt kê, `findSizeChartRows` (bảng sản phẩm thắng danh mục), `lookupSize`. `check-rls.ts`: kỳ vọng. Test tích hợp `packages/db/tests/size-charts.int.test.ts`.

## Đã đọc và rút ra
- `abbreviations` (0041) là mẫu RLS Owner ghi; `product_aliases` (0043) là mẫu FK ghép + test tích hợp.
- Làn không có DB: `pnpm test:db` không chạy được ở máy làn (không có `.env`/máy phụ) → test tích hợp và `db:check-rls` chỉ chạy ở CI.
- `pnpm typecheck` đỏ sẵn ở `shared/src/product-import/xlsx*.ts` (thiếu `fflate` trong node_modules của worktree), không thuộc nhánh này; `pnpm lint` chỉ còn cảnh báo của file khác.

## Còn lại
- API `/size-charts`, trang quản trị "Bảng size" (UI, cần Stitch), trích chiều cao/cân nặng (`extract`) + nối `lookupSize` vào pipeline, ghi `kb_gaps` topic `size` khi `recordGap`, câu mời ib theo `brand_voice`.

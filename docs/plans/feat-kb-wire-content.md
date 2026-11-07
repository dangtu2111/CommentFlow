# Kế hoạch `feat-kb-wire-content` — Cơ sở kiến thức: trang "Nguồn dữ liệu" theo Stitch + nhập tay Thông tin cửa hàng / Chính sách / FAQ / Giọng văn

> Trạng thái duyệt: **Đã duyệt** (chủ dự án giao việc 07/11/2026: gắn chức năng đã có vào Cơ sở kiến thức, thứ tự 1 → 2; nút chưa có chức năng giữ nguyên "Sắp có").

## Việc

Mã gap matrix: `KB-CONTENT-UI` · Spec: FR-050, FR-142, `design/stitch/knowledge-base.{png,html}`.

**Tóm tắt:** (1) Trang `/app/kb` dựng theo Stitch với số liệu THẬT (đếm sản phẩm/chính sách/FAQ, danh sách nguồn `kb_sources`, một sản phẩm mẫu, lối chạy thử); khối Shopify, thêm/đồng bộ URL, ghi chú riêng cho AI vẫn hiện nhưng "Sắp có". (2) Bốn trang nhập tay (Owner): `/app/kb/shop`, `/policies`, `/faq`, `/voice` — Server Action + `withActor`, dùng `parse*` của `@flow/shared`. (3) Rail điều hướng theo Stitch, thêm mục "Sắp có" (Tài liệu, Quy tắc & Giới hạn, Từ điển viết tắt). Không migration.

## Điểm chưa rõ

Không có. (Bốn trang nhập tay chưa có màn Stitch riêng → dựng theo ngôn ngữ hình ảnh Stitch, ghi vào `docs/plans/ui-thieu-thiet-ke.md`.)

## Tiêu chí nghiệm thu

1. Đọc kiến thức đúng workspace, bỏ sản phẩm đã lưu trữ — kiểm bằng: `kb-content-read.int.test.ts`.
2. Biểu mẫu → đầu vào đã kiểm bằng `parse*` (xưng hô theo ngôn ngữ, website http(s), câu mời cần đủ hai câu) — kiểm bằng: `kb-content-form.test.ts`.
3. Mọi action chỉ Owner, workspace từ phiên — kiểm bằng: `require-app-user.scan.test.ts`.
4. Thêm/sửa/xóa FAQ, thêm/xóa chính sách, lưu thông tin cửa hàng và giọng văn chạy thật, vi + en — kiểm bằng: E2E `kb-content.spec.ts`.
5. Rail có mục thật và mục "Sắp có" vô hiệu — kiểm bằng: E2E `kb-content.spec.ts`, `kb-structure.test.ts`.
6. Công cụ xanh — kiểm bằng: `pnpm precheck`, `pnpm lint:i18n`.

## File sẽ đọc

`design/stitch/knowledge-base.*`, `packages/db/src/queries/kb-content.ts`, `packages/shared/src/kb-content.ts`, `apps/web/src/components/kb/*`, `apps/web/src/lib/{app-nav,kb-structure}.ts`.

## File sẽ sửa / tạo

`packages/db/src/queries/kb-content.ts` (+ test tích hợp), `runtime.ts`; web: `app/(guarded)/kb/{page,actions}.ts(x)`, `kb/{shop,policies,faq,voice}/page.tsx`, `components/kb/{kb-content-ui,kb-frame}.tsx`, `lib/{kb-content-form,kb-structure,app-nav}.ts`, `components/app/shell-nav.tsx`, i18n vi/en, `e2e/tests/kb-content.spec.ts`.

## Migration

Không có.

## Test viết trước

`kb-content-read.int.test.ts`, `kb-content-form.test.ts`, `kb-content.spec.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/kb-content-read.int.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib` · `FB_OAUTH_ENABLED=false node scripts/e2e.mjs tests/kb-content.spec.ts`

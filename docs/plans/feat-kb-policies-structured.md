# Kế hoạch `feat/kb-policies-structured` — Trang "Chính sách có cấu trúc" (bản chỉ đọc, PR A)

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` (mới) · ADR 017 · thiết kế `design/stitch/kb-policies-structured.*` (Stitch, đã đồng bộ ở #301). PR B (thao tác Owner: Duyệt/Sửa/Bỏ/Thêm) làm sau.

**Tóm tắt (2–3 câu dễ hiểu):** Dựng trang Chính sách có cấu trúc đọc dữ liệu thật từ bảng `policy_facts`: bốn thẻ Ship/Đổi trả/Bảo hành/Thanh toán, trạng thái Nháp/Đã duyệt, nguồn, trích dẫn nguyên văn, banner "AI đề xuất N giá trị", độ phủ. Staff chỉ xem (khóa mềm), Owner thấy các nút (tạm khóa, "Sắp có" tới PR B). Không migration, không đổi RLS, chỉ đọc dữ liệu.

## Điểm chưa rõ

Không có. Quyết định: giữ phần "Chính sách dạng văn bản" (nuôi tìm kiếm tri thức, nguồn để AI rút đề xuất) ở dưới trang, chỉ Owner thấy.

## Tiêu chí nghiệm thu

1. Hàm thuần `buildPolicyFactsView`: nhóm đúng 4 thẻ, ghép bản duyệt với nháp cùng (kind, slot), độ phủ, đếm nháp, bỏ dòng sai cấu trúc — kiểm bằng: `lib/kb-policy-view.test.ts`.
2. `PolicyFactsPanel` hiển thị đúng: thẻ trống, phí/thời gian/COD/khu vực (VND và ngoại tệ), đổi trả/bảo hành/thanh toán, chip trạng thái/nguồn/"Đã sửa tay"/"Cần xác nhận", banner đếm đúng, trích dẫn nguyên văn; Staff không có nút — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`.
3. Ảnh chụp 1440px và 390px (dữ liệu [MẪU]) cạnh bản Stitch, nộp ở `docs/plans/ui-fidelity/kb-policies-structured/` — kiểm bằng: `node e2e/tools/shot-kb-policies.mjs`.
4. Trang `/app/kb/policies`: thành viên nào cũng xem được phần có cấu trúc, phần văn bản chỉ Owner; không đổi quyền các trang khác — kiểm bằng: typecheck + đọc diff.

## File sẽ đọc

`packages/db/src/queries/policy-facts.ts` (`listAllPolicyFacts`), `packages/shared/src/policy-facts.ts` (Zod), `apps/web/src/app/app/(guarded)/kb/policies/page.tsx`, `design/stitch/kb-policies-structured.*`.

## File sẽ sửa / tạo

Tạo: `apps/web/src/lib/kb-policy-view.ts` (+ test), `apps/web/src/components/kb/policy-facts-panel.tsx` (+ test), `apps/web/src/app/dev/ui/kb-policies/page.tsx` (route [MẪU]), `e2e/tools/shot-kb-policies.mjs`. Sửa: `apps/web/src/app/app/(guarded)/kb/policies/page.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json` (khóa `kbPolicyFacts`).

## Migration

Không.

## Test viết trước

Test đơn vị viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/kb-policy-view.test.ts src/components/kb/policy-facts-panel.test.tsx`

# Kế hoạch `feat/kb-policies-edit-prefill` — Sửa tay không 404 với COD chung và hiện câu gốc khi sửa nháp của máy

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017 · lỗi báo: "nhấn Sửa tay không thấy giá trị".

**Tóm tắt (2–3 câu dễ hiểu):** Nút "Sửa tay" của dòng COD chung (thẻ Vận chuyển, do Shopify/văn bản đề xuất) dẫn tới trang chưa biết loại `cod` nên trả 404 — nay có biểu mẫu COD (Có/Không) điền sẵn. Khi sửa một nháp do máy đề xuất, biểu mẫu hiện thêm câu gốc trong văn bản để đối chiếu. Thêm kiểm thử trang sửa để chắc giá trị đang có luôn được điền sẵn; route dev [MẪU] để xem biểu mẫu trong trình duyệt.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Trang `/app/kb/policies/edit` truyền đúng giá trị điền sẵn: sửa bản đã duyệt, ưu tiên nháp cùng slot (kèm `draft {id, rev}`), ship khóa nhãn, loại một giá trị quay về sửa dòng đang có, 404 với loại/id lạ — kiểm bằng: `kb/policies/edit/page.test.tsx`.
2. Loại `cod` (COD chung) có biểu mẫu Có/Không đọc/ghi đúng; không còn 404 — kiểm bằng: `lib/kb-policy-form.test.ts`, `policy-value-form.test.tsx`, `edit/page.test.tsx`.
3. Sửa nháp của máy hiện khối "Trích từ văn bản gốc" — kiểm bằng: `policy-value-form.test.tsx`, `edit/page.test.tsx`.
4. Trình duyệt thật hiển thị giá trị điền sẵn đúng cho cả 5 loại (route dev [MẪU] `/dev/ui/kb-policies-edit?kind=…`) — kiểm bằng: ảnh chụp + đọc giá trị ô bằng Playwright (đã chạy, giá trị đủ).
5. Tự kiểm theo `verify.md`: không migration/RLS/trigger, không đổi quyền (trang vẫn chỉ Owner) — kiểm bằng: đọc diff.

## File sẽ đọc

`kb/policies/edit/page.tsx`, `lib/kb-policy-form.ts`, `components/kb/policy-value-form.tsx`.

## File sẽ sửa / tạo

Tạo: `kb/policies/edit/page.test.tsx`, `app/dev/ui/kb-policies-edit/page.tsx` (route [MẪU]). Sửa: `lib/kb-policy-form.ts` (+ test), `components/kb/policy-value-form.tsx` (+ test), `kb/policies/edit/page.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json`.

## Migration

Không.

## Test viết trước

Test viết cùng mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run "src/app/app/(guarded)/kb/policies/edit/page.test.tsx" src/lib/kb-policy-form.test.ts src/components/kb/policy-value-form.test.tsx`

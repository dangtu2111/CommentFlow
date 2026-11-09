# Kế hoạch `feat/kb-policies-leftover` — Liệt kê phần dữ liệu thô chưa phân tách được

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017. Lỗi báo: "dữ liệu thô còn nhiều thông tin khác mà không liệt kê vào đâu".

**Tóm tắt (2–3 câu dễ hiểu):** Bộ phân tách chỉ đưa thành giá trị những câu nêu số/điều kiện rõ ràng; phần còn lại của văn bản chính sách thô (phí theo điều kiện, giờ làm việc, liên hệ, câu mô tả…) hiện không hiển thị ở đâu. Nay mỗi thẻ có khối gập "Thông tin khác từ văn bản thô (N câu chưa phân tách)" liệt kê các câu thuộc chủ đề đó, và mục "Thông tin khác" cho câu ngoài bốn chủ đề. Chỉ Owner thấy (văn bản thô vốn chỉ Owner đọc); không tạo giá trị mới, không cho AI dùng thêm gì, không migration.

## Điểm chưa rõ

Không có. Quyết định: "đã phân tách" = câu nằm trong câu bằng chứng của một dòng `policy_facts` (nháp hoặc đã duyệt); xếp thẻ theo từ khóa chủ đề (`classifyTopic`), không rõ chủ đề → "Thông tin khác"; trần 200 câu.

## Tiêu chí nghiệm thu

1. `buildPolicyLeftover`: câu nằm trong bằng chứng thì không liệt kê (không phân biệt hoa/thường, khoảng trắng; bằng chứng nhiều câu phủ từng câu); còn lại xếp đúng thẻ; câu trùng chỉ một lần; cắt ở trần — kiểm bằng: `lib/kb-policy-leftover.test.ts`.
2. Panel: mỗi thẻ có khối gập đúng số câu, mục "Thông tin khác" chỉ hiện khi có câu, Staff không thấy — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`.
3. Bộ tách câu dùng chung với bộ đề xuất (một nguồn): `splitPolicySentences` xuất từ `@flow/ai` — kiểm bằng: `pnpm --filter @flow/ai exec vitest run src/fact-plan` và typecheck.
4. Tự kiểm theo `verify.md`: không migration/RLS/trigger; chỉ đọc bảng văn bản thô trong trang Owner; không ghi gì — kiểm bằng: đọc diff.

## File sẽ đọc

`packages/ai/src/fact-plan/suggest.ts`, `packages/ai/src/kb-sync/topic.ts`, `kb/policies/page.tsx`.

## File sẽ sửa / tạo

Tạo: `apps/web/src/lib/kb-policy-leftover.ts` (+ test). Sửa: `packages/ai/src/fact-plan/{suggest,index}.ts` (xuất bộ tách câu), `components/kb/policy-facts-panel.tsx` (+ test), `kb/policies/page.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json`.

## Migration

Không.

## Test viết trước

Test viết cùng mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/kb-policy-leftover.test.ts src/components/kb`

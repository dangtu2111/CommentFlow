# Kế hoạch `feat/kb-policies-raw-view` — Cho Owner xem văn bản thô đã nạp và báo rõ khi không rút được giá trị

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017 · chồng lên `feat/kb-policies-analyze` (#307).

**Tóm tắt (2–3 câu dễ hiểu):** Khi thẻ chính sách trống dù đã đồng bộ Shopify, Owner không biết hệ thống đã nạp những văn bản nào và vì sao chưa có giá trị. Khối "Từ dữ liệu thô…" nay có danh sách gập các văn bản thô đã nạp (loại, tiêu đề, đoạn đầu), và nút Phân tách tự động báo rõ "Không có giá trị mới: văn bản chưa nêu số/phí rõ ràng hoặc đã khớp giá trị đang duyệt" thay vì "0 giá trị". Chỉ Owner thấy (văn bản thô vốn chỉ Owner đọc); không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Danh sách văn bản thô: Owner thấy loại/tiêu đề/đoạn đầu (≤ 180 ký tự, bỏ xuống dòng); Staff và danh sách rỗng thì không — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`.
2. Phân tách không ra nháp mới → `?pn=analyzed_none` (thông báo thành công, không phải lỗi) — kiểm bằng: `kb/policy-actions.test.ts`, `policy-facts-panel.test.tsx`.
3. Tự kiểm theo `verify.md`: không migration/RLS/trigger, chỉ đọc thêm cột có sẵn trong trang Owner — kiểm bằng: đọc diff.

## File sẽ đọc

`apps/web/src/app/app/(guarded)/kb/policies/page.tsx`, `components/kb/policy-facts-panel.tsx`.

## File sẽ sửa / tạo

Sửa: `kb/policies/page.tsx`, `kb/policy-actions.ts` (+ test), `lib/kb-policy-notice.ts`, `components/kb/policy-facts-panel.tsx` (+ test), `packages/shared/src/i18n/messages/{vi,en}.json`.

## Migration

Không.

## Test viết trước

Test viết cùng mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run "src/app/app/(guarded)/kb/policy-actions.test.ts" src/components/kb`

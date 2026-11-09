# Kế hoạch `feat/kb-policies-backend` — Hoàn thiện backend trang Chính sách có cấu trúc

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017. Backend đã có: lưu/duyệt/bỏ/sửa nháp, đề xuất từ Shopify, nạp giá trị đã duyệt cho fact plan. Bổ sung ba phần còn thiếu của trang.

**Tóm tắt (2–3 câu dễ hiểu):** (1) Khi duyệt, kiểm lại cấu trúc dữ liệu bằng Zod (không tin dữ liệu đã nằm trong bảng) — sai thì không duyệt. (2) Owner xóa được một giá trị đã duyệt (vd. một khu vực ship) kèm phiên bản `rev`, nút Xóa hai bước. (3) Mỗi dòng có mốc "Cập nhật lúc" theo giờ Việt Nam. Không migration/RLS/trigger.

## Điểm chưa rõ

Không có. Ghi nhận (không làm vì cần bảng mới = migration, chờ chủ dự án quyết): nhật ký thay đổi chính sách (ai duyệt/sửa/xóa lúc nào, xem trang Nhật ký) — hiện chỉ có `approved_by/approved_at` của dòng hiện tại.

## Tiêu chí nghiệm thu

1. `approvePolicyFact` kiểm lại `data` bằng Zod: nháp sai cấu trúc (lọt vào bảng) → `invalid`, vẫn là nháp, không có bản đã duyệt — kiểm bằng: `packages/db/tests/policy-facts.int.test.ts`.
2. `deleteApprovedPolicyFact`: lệch `rev` → `stale`; Staff không xóa được; đúng `rev` → xóa, nháp cùng slot giữ nguyên; không xóa được nháp bằng hàm này; lần hai → `not_found` — kiểm bằng: cùng test.
3. Dòng trả về có `updatedAt`/`approvedAt`; panel hiển thị "Cập nhật lúc …" giờ Việt Nam, bỏ qua giá trị thiếu/sai — kiểm bằng: cùng test + `components/kb/policy-facts-panel.test.tsx`.
4. Server Action Xóa: chỉ Owner, id/rev từ form, kết quả `deleted/stale/not_found` → `?pn=`; duyệt trả `invalid` → thông báo `invalid` — kiểm bằng: `kb/policy-actions.test.ts`.
5. Tự kiểm theo `docs/workflows/verify.md`: không migration/RLS/trigger; xóa chỉ trên bản đã duyệt qua hàm DB có khóa dòng + `rev`; Staff bị RLS chặn — kiểm bằng: đọc diff cuối nhánh (nhãn "tự kiểm, chưa có kiểm chứng độc lập").

## File sẽ đọc

`packages/db/src/queries/policy-facts.ts`, `apps/web/src/app/app/(guarded)/kb/policy-actions.ts`, `components/kb/policy-facts-panel.tsx`.

## File sẽ sửa / tạo

Sửa: `packages/db/src/queries/policy-facts.ts`, `packages/db/src/runtime.ts`, `packages/db/tests/policy-facts.int.test.ts`, `kb/policy-actions.ts` (+ test), `kb/policies/page.tsx`, `lib/kb-policy-notice.ts`, `lib/kb-policy-view.ts`, `components/kb/policy-facts-panel.tsx` (+ test), `packages/shared/src/i18n/messages/{vi,en}.json`, `docs/gap-matrix.md`.

## Migration

Không.

## Test viết trước

Test viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/policy-facts.int.test.ts`; `pnpm --filter @flow/web exec vitest run "src/app/app/(guarded)/kb/policy-actions.test.ts" src/components/kb`

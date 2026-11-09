# Kế hoạch `feat/kb-policies-edit` — Sửa tay và Thêm giá trị chính sách có cấu trúc (PR B2)

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017 · tiếp nối #302 (chỉ đọc) và #303 (Duyệt/Bỏ).

**Tóm tắt (2–3 câu dễ hiểu):** Owner bấm "Sửa tay" hoặc "Thêm giá trị" để nhập giá trị chính sách bằng biểu mẫu theo từng loại (khu vực ship, đổi trả, bảo hành, thanh toán). Giá trị luôn lưu thành bản NHÁP của Owner (đã sửa tay, không bị đồng bộ ghi đè); muốn AI dùng phải bấm Duyệt, và khối nháp hiển thị so sánh bản mới với bản đang duyệt trước khi duyệt thay. Rủi ro: ghi dữ liệu mà AI dùng trả lời khách nên chỉ Owner, qua `withActor`, không đổi quyền hay migration.

## Điểm chưa rõ

Không có. Quyết định: lưu luôn là nháp (không ghi thẳng bản đã duyệt) để mọi thay đổi đều qua bước Duyệt có so sánh; chưa có thiết kế Stitch cho biểu mẫu (ghi `docs/plans/ui-thieu-thiet-ke.md`).

## Tiêu chí nghiệm thu

1. `formToPolicyData` đọc biểu mẫu thành `data` đã kiểm Zod đúng cho 4 loại (phí cố định/miễn phí/miễn phí từ ngưỡng/tính khi thanh toán, khoảng ngày, COD, nội thành cần thành phố, vùng cần tỉnh/thành, đổi trả/bảo hành "không có", phương thức thanh toán) và từ chối giá trị sai — kiểm bằng: `lib/kb-policy-form.test.ts`.
2. `savePolicyValueAction`: chỉ Owner; ghi NHÁP `origin = 'manual'`; đang có nháp cùng (kind, slot) thì thay tại chỗ bằng `editPolicyDraft`; lệch `draftId`/`rev` hoặc nháp mới xuất hiện → `stale` không ghi; form sai → `invalid`; chống bấm đúp; lỗi bất ngờ → `unavailable` — kiểm bằng: `kb/policy-actions.test.ts`.
3. Biểu mẫu hiển thị đúng các ô theo loại, điền sẵn từ giá trị hiện có, khóa nhãn dòng ship đã có, kèm `draftId`/`rev` ẩn khi sửa nháp — kiểm bằng: `components/kb/policy-value-form.test.tsx`.
4. Panel: nút Sửa tay/Thêm là liên kết tới biểu mẫu (Owner), Staff không có — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`.
5. Tự kiểm theo `docs/workflows/verify.md`: không migration/RLS/trigger; ghi qua hàm DB đã kiểm Zod; không log nội dung — kiểm bằng: đọc diff cuối nhánh (nhãn "tự kiểm, chưa có kiểm chứng độc lập").

## File sẽ đọc

`apps/web/src/lib/kb-content-form.ts` (mẫu), `components/kb/kb-content-ui.tsx` (ô nhập), `packages/shared/src/policy-facts.ts` (Zod), `packages/db/src/queries/policy-facts.ts`.

## File sẽ sửa / tạo

Tạo: `apps/web/src/lib/kb-policy-form.ts` (+ test), `components/kb/policy-value-form.tsx` (+ test), `app/app/(guarded)/kb/policies/edit/page.tsx`. Sửa: `kb/policy-actions.ts` (+ test), `lib/kb-policy-notice.ts`, `components/kb/policy-facts-panel.tsx` (+ test), `packages/shared/src/i18n/messages/{vi,en}.json`, `docs/plans/ui-thieu-thiet-ke.md`, `docs/gap-matrix.md`.

## Migration

Không.

## Test viết trước

Test viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/kb-policy-form.test.ts "src/app/app/(guarded)/kb/policy-actions.test.ts" src/components/kb`

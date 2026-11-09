# Bàn giao `feat/policy-owner-edit` (POLICY-DRAFT-OWNER-EDIT, PR #297 đã merge)

Agent vừa làm: Claude Code.

## Đã làm

- `editPolicyDraft` (`packages/db/src/queries/policy-facts.ts`): Owner sửa nháp của máy → thay bằng nháp `origin = 'manual'` cùng (kind, slot), giữ evidence/source_ref; nháp `manual` cập nhật tại chỗ. Kiểm `rev` (`stale`), `not_found`, Zod.
- `refreshPolicySuggestions` bỏ qua slot có nháp `manual` (không ghi đè, không xóa). Không migration/RLS/trigger.

## Lưu ý cho UI (PR 4)

1. Sửa nháp của máy XÓA dòng cũ và TẠO dòng mới (id đổi, `rev` về 1) → màn hình phải tải lại danh sách sau khi lưu, không giữ id cũ.
2. Nháp `manual` giữ evidence của máy → màn hình gắn nhãn "đã sửa tay" cạnh trích dẫn nguồn.

## Còn lại

Giao diện gọi `editPolicyDraft` (PR 4, chờ màn Stitch "Chính sách có cấu trúc"). Staff gọi hàm nhận `not_found` (không thấy dòng ở bước khóa), không phải lỗi quyền.

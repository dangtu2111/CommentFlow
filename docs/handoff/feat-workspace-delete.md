# Handoff `feat-workspace-delete` (claude, làn b)

## Đã làm
- Migration 0055: `core.workspace_deletion_requests` (không FK → nhật ký tối thiểu sống sót) + hàm DEFINER Owner (`request_/confirm_/cancel_workspace_deletion`, cf_app, `withActor`) và worker (`list_due_workspace_deletions` trần, `execute_workspace_deletion` `withJob`).
- `@flow/shared` `workspace-deletion.ts` (hằng 7 ngày/15 phút, `matchesDeletionConfirmation`, `deletionPhase`, `parseConfirmDeletion`); `@flow/db` wrapper; job worker `runWorkspaceDeletion` sau cờ `WORKSPACE_DELETE_ENABLED` (mặc định TẮT); `check-rls.ts` thêm `checkWorkspaceDeletion` + whitelist hàm worker.
- Test: shared, job worker, config, check-rls (fake), tích hợp `workspace-deletion.int.test.ts` (RLS, chéo workspace, cascade, hủy giữa chừng).
- Docs: plan, Q-WSD1, codemap.d, CBCC, KT-WSD, gap-matrix/MASTER.

## Đã đọc + điều rút ra
- Mọi bảng có `workspace_id` đã `ON DELETE cascade`; trigger `guard_last_owner` đã bỏ qua xóa cascade → `DELETE core.workspaces` trong hàm DEFINER là đủ.
- `cf_worker` kế thừa `cf_app` nên có EXECUTE gián tiếp lên hàm Owner (vô hại, hàm đòi người dùng) — check-rls không cấm.
- Đồng hồ máy DB lệch máy test ~1s: test thời gian dùng dung sai ±1 phút.
- `pnpm lint` đang đỏ do lỗi có sẵn ở `globals.css` (không thuộc nhánh này).

## Còn lại
- `WORKSPACE-DELETE-UI`: nối nút ở Quyền riêng tư (Server Action dùng `withActor` + `requestWorkspaceDeletion`/`confirmWorkspaceDeletion`/`cancelWorkspaceDeletion`, chỉ Owner, 404 chéo workspace, i18n vi/en).
- Thu hồi webhook/token Meta khi xóa, email báo Owner, bắt buộc xuất dữ liệu trước (`DATA-EXPORT`).

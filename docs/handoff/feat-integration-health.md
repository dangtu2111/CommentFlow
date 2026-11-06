# Handoff `feat-integration-health` (ADMIN-INTEGRATION-HEALTH, FR-104) — Claude Code, làn b

## Đã làm
- Lõi thuần `packages/shared/src/integration-health.ts` (+test): quyền Super Admin, đánh giá ok/degraded/down, che thông báo lỗi.
- Migration 0059: `cf.integration_incidents` (RLS: hệ thống ghi, thành viên đọc) + hàm DEFINER `cf.assert_super_admin`, `cf.admin_integration_health`, `cf.admin_dead_letters`.
- `packages/db/src/queries/integration-health.ts` (export ở `runtime.ts`), test tích hợp `tests/integration-health.int.test.ts`, kỳ vọng ở `check-rls.ts`.
- Quyết định Q-AIH1; KT-AIH; codemap; docs/10.

## Điều rút ra
- RLS check yêu cầu bảng có `workspace_id` theo mẫu `current_workspace_id()`; xuyên workspace chỉ qua hàm DEFINER.
- `pnpm db:check-rls` CLI chạy trên `cf_dev` (chưa migrate 0059 ở máy này); logic đã được `check-rls.int.test.ts` kiểm trong `test:db` trên `cf_test`.
- `packages/ai` `test:db` có 1 test LiteLLM thất bại do khóa môi trường (không liên quan nhánh này).

## Còn lại (gap)
`INTEGRATION-HEALTH-WIRE` (connector/worker gọi `recordIntegrationIncident`), `-QUEUE-WIRE` (số liệu pg-boss), `-UI` (trang Admin + Thử lại/Bỏ qua có lý do), `-RETENTION` (dọn sự cố cũ).

- `INTEGRATION-HEALTH-RETENTION`: dọn sự cố cũ.
- `INTEGRATION-HEALTH-HARDEN` (từ verifier): kiểm check-rls riêng cho 3 hàm DEFINER; partial index `webhook_events (created_at DESC) WHERE status = dead` ở migration riêng; route web phải kiểm phiên Admin + `canViewIntegrationHealth` trước `withUser`; rà nơi ghi `webhook_events.error`.
- Đã sửa theo verifier: hàm từ chối khi có workspace, `code` theo regex, cắt lỗi sau khi che, thêm cột bất biến.

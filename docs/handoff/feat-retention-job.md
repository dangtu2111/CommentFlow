# Bàn giao `feat-retention-job` (claude)

**Đã làm:** migration 0053 (`cf.ai_usage_daily`, `cf.compact_ai_usage`, `cf.purge_expired_workspace_data`), `retention-policy.ts` (logic thuần + property test), `purgeExpiredWorkspaceData`/`compactAiUsage` trong `packages/db/src/retention.ts`, 2 bước mới trong `apps/worker/src/jobs/retention.ts`, cập nhật `check-rls.ts`. Test: unit, property, worker, int DB (`retention-job.int.test.ts`), `db:check-rls` đạt.

**Rút ra:** job retention có sẵn (0026/0040) là mẫu; hàm DEFINER chỉ `cf_worker` + ngữ cảnh trần; `check-rls.ts` có nhiều mảng phải cập nhật khi thêm bảng (cột cấm ghi, policy actor, danh sách RLS/NO_DELETE, ngoại lệ hàm cf_worker).

**Còn lại:** `RETENTION-MESSAGES` (khi có bảng tin nhắn), xóa workspace vĩnh viễn (`DB-MAINTENANCE-ROLE`), chạy thật trên staging (worker mới + `pnpm db:migrate`).

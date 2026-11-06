SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- ===================================================================================================
-- FIX 0047 (RLS cf.automation_settings): nhánh "hệ thống" của policy INSERT/UPDATE không ràng `updated_by`, nên
-- withJob ghi được updated_by = id của một người (giả danh Owner). Đúng thiết kế (0047): Owner => updated_by = chính
-- người ghi; hệ thống => updated_by NULL.
-- Viết "NULL" bằng num_nonnulls(updated_by) = 0 vì check-rls cấm chuỗi `IS NULL` trong policy ghi bảng này
-- (Postgres in `IS NOT DISTINCT FROM NULL` thành `IS NULL`).
-- Đường lùi: tạo lại hai policy như 0047 (nhánh hệ thống không ràng updated_by) — KHÔNG khuyến nghị.
-- ===================================================================================================
DROP POLICY automation_settings_insert ON cf.automation_settings;
--> statement-breakpoint
CREATE POLICY automation_settings_insert ON cf.automation_settings FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND updated_by = (SELECT core.current_user_id()))
      OR ((SELECT core.is_system_context()) AND num_nonnulls(updated_by) = 0)
    )
  );
--> statement-breakpoint
DROP POLICY automation_settings_update ON cf.automation_settings;
--> statement-breakpoint
CREATE POLICY automation_settings_update ON cf.automation_settings FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND updated_by = (SELECT core.current_user_id()))
      OR ((SELECT core.is_system_context()) AND num_nonnulls(updated_by) = 0)
    )
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

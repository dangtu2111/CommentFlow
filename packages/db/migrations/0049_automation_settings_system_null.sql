SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Sửa 0047: đường HỆ THỐNG (is_system_context) phải ghi updated_by = null (không gán người). Trước đây policy cho hệ thống
-- ghi updated_by bất kỳ. Dùng num_nulls(updated_by) = 1 (không dùng IS NULL — check-rls cấm ở policy ghi).
-- Đường lùi: DROP + tạo lại hai policy theo 0047.
DROP POLICY automation_settings_insert ON cf.automation_settings;
--> statement-breakpoint
CREATE POLICY automation_settings_insert ON cf.automation_settings FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND updated_by = (SELECT core.current_user_id()))
      OR ((SELECT core.is_system_context()) AND num_nulls(updated_by) = 1)
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
      OR ((SELECT core.is_system_context()) AND num_nulls(updated_by) = 1)
    )
  );

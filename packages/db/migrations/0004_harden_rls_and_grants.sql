-- Siết RLS và quyền sau khi kiểm chứng độc lập (verifier-db, verifier-security).
-- Thay đổi chỉ THU HẸP quyền và thêm trigger; không đụng dữ liệu.
-- Đường lùi: tạo lại policy/quyền cũ ở 0001_rls_and_grants.sql, DROP TRIGGER *_truncate ở cuối file này.

-- ===== 1) Hàm ngữ cảnh chỉ role ứng dụng gọi được =====
REVOKE ALL ON FUNCTION core.current_workspace_id(), core.current_user_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.current_workspace_id(), core.current_user_id() TO cf_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.notify_flags_changed() FROM PUBLIC;
--> statement-breakpoint

-- ===== 2) Đọc chéo workspace chỉ khi KHÔNG có ngữ cảnh workspace (ngữ cảnh "liệt kê workspace của tôi") =====
-- Trong withWorkspace(A) tuyệt đối chỉ thấy workspace A, kể cả khi app.user_id cũng được đặt.
-- Thành viên không còn 'active' không được liệt kê.
DROP POLICY workspaces_select ON core.workspaces;
--> statement-breakpoint
CREATE POLICY workspaces_select ON core.workspaces FOR SELECT USING (
  id = (SELECT core.current_workspace_id())
  OR (
    (SELECT core.current_workspace_id()) IS NULL
    AND id IN (
      SELECT m.workspace_id FROM core.members m
      WHERE m.user_id = (SELECT core.current_user_id()) AND m.status = 'active'
    )
  )
);
--> statement-breakpoint
DROP POLICY members_select ON core.members;
--> statement-breakpoint
CREATE POLICY members_select ON core.members FOR SELECT USING (
  workspace_id = (SELECT core.current_workspace_id())
  OR (
    (SELECT core.current_workspace_id()) IS NULL
    AND user_id = (SELECT core.current_user_id())
    AND status = 'active'
  )
);
--> statement-breakpoint

-- ===== 3) Không xóa cứng workspace từ role ứng dụng =====
-- Xóa cứng làm cascade xóa cả action_logs/ai_usage (vốn chỉ thêm). Spec dùng status='deleted' (xóa mềm);
-- xóa vĩnh viễn do job/role đặc quyền làm ở giai đoạn sau (quyền riêng tư/xóa workspace).
DROP POLICY workspaces_delete ON core.workspaces;
--> statement-breakpoint
REVOKE DELETE ON core.workspaces FROM cf_app;
--> statement-breakpoint

-- ===== 4) core.users: không tự nâng quyền Admin, không xóa người dùng =====
-- Cột is_admin/admin_role chỉ ghi được bởi role Admin riêng (làm ở giai đoạn sau).
REVOKE UPDATE, DELETE ON core.users FROM cf_app;
--> statement-breakpoint
GRANT UPDATE (email, name, email_verified, image, totp_enabled, locale, updated_at) ON core.users TO cf_app;
--> statement-breakpoint

-- ===== 5) TRUNCATE cũng làm mất hiệu lực cache flag =====
CREATE TRIGGER feature_flags_notify_truncate
  AFTER TRUNCATE ON core.feature_flags
  FOR EACH STATEMENT EXECUTE FUNCTION core.notify_flags_changed();
--> statement-breakpoint
CREATE TRIGGER feature_flag_overrides_notify_truncate
  AFTER TRUNCATE ON core.feature_flag_overrides
  FOR EACH STATEMENT EXECUTE FUNCTION core.notify_flags_changed();

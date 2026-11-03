-- RLS, hàm đọc ngữ cảnh và quyền cho role ứng dụng `cf_app` (docs/10 §4, docs/13 §4).
-- Role `cf_app` (không BYPASSRLS, không sở hữu bảng) và `cf_owner` được tạo ở bước khởi tạo DB
-- (infra/postgres/init). Ngữ cảnh do withWorkspace() đặt bằng set_config(..., is_local => true):
--   app.workspace_id : workspace đang xử lý (bắt buộc với bảng nghiệp vụ)
--   app.user_id      : người dùng đang thao tác (chỉ để liệt kê workspace của chính họ)

-- NULLIF vì sau COMMIT/ROLLBACK, biến tùy chỉnh quay về '' (không phải NULL) trên kết nối dùng lại.
CREATE FUNCTION core.current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION core.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- ===== Quyền (cấp tường minh từng bảng; bảng mới phải khai báo quyền của nó) =====
GRANT USAGE ON SCHEMA core, cf TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.current_workspace_id(), core.current_user_id() TO cf_app;
--> statement-breakpoint
-- Bảng hệ thống (không có workspace_id, không RLS): xác thực.
GRANT SELECT, INSERT, UPDATE, DELETE ON core.users, core.sessions, core.accounts, core.verifications TO cf_app;
--> statement-breakpoint
-- Feature flag: ứng dụng chỉ đọc; ghi do Admin (role riêng, làm ở giai đoạn sau).
GRANT SELECT ON core.feature_flags, core.feature_flag_overrides TO cf_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON core.workspaces, core.members, core.invitations TO cf_app;
--> statement-breakpoint
-- Chỉ thêm, không sửa/xóa.
GRANT SELECT, INSERT ON core.action_logs, cf.ai_usage TO cf_app;
--> statement-breakpoint

-- ===== core.workspaces: khóa chính chính là định danh workspace =====
ALTER TABLE core.workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Đọc: workspace đang xử lý, hoặc workspace mà người dùng hiện tại là thành viên (để chuyển workspace).
CREATE POLICY workspaces_select ON core.workspaces FOR SELECT USING (
  id = (SELECT core.current_workspace_id())
  OR id IN (SELECT m.workspace_id FROM core.members m WHERE m.user_id = (SELECT core.current_user_id()))
);
--> statement-breakpoint
CREATE POLICY workspaces_insert ON core.workspaces FOR INSERT
  WITH CHECK (id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY workspaces_update ON core.workspaces FOR UPDATE
  USING (id = (SELECT core.current_workspace_id()))
  WITH CHECK (id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY workspaces_delete ON core.workspaces FOR DELETE
  USING (id = (SELECT core.current_workspace_id()));
--> statement-breakpoint

-- ===== core.members =====
ALTER TABLE core.members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Đọc được thêm các dòng của CHÍNH mình ở workspace khác (liệt kê workspace); ghi chỉ trong workspace hiện tại.
CREATE POLICY members_select ON core.members FOR SELECT USING (
  workspace_id = (SELECT core.current_workspace_id())
  OR user_id = (SELECT core.current_user_id())
);
--> statement-breakpoint
CREATE POLICY members_insert ON core.members FOR INSERT
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY members_update ON core.members FOR UPDATE
  USING (workspace_id = (SELECT core.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY members_delete ON core.members FOR DELETE
  USING (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint

-- ===== core.invitations =====
ALTER TABLE core.invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitations_isolation ON core.invitations
  USING (workspace_id = (SELECT core.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint

-- ===== core.feature_flag_overrides (chỉ đọc override của workspace hiện tại) =====
ALTER TABLE core.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY feature_flag_overrides_select ON core.feature_flag_overrides FOR SELECT
  USING (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint

-- ===== core.action_logs và cf.ai_usage (chỉ thêm + đọc trong workspace hiện tại) =====
ALTER TABLE core.action_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY action_logs_select ON core.action_logs FOR SELECT
  USING (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY action_logs_insert ON core.action_logs FOR INSERT
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
ALTER TABLE cf.ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_usage_select ON cf.ai_usage FOR SELECT
  USING (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY ai_usage_insert ON cf.ai_usage FOR INSERT
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()));

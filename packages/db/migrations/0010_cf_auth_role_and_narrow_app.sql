-- Role riêng cf_auth cho adapter Better Auth + thu hẹp quyền của cf_app trên các bảng xác thực
-- (quyết định của chủ dự án sau kiểm chứng lần ba; docs/10 §4, ADR 003).
--
--  * cf_auth (tạo bởi script khởi tạo Postgres, KHÔNG tạo ở đây vì cf_owner không có CREATEROLE):
--    chỉ có quyền trên users, sessions, accounts, verifications (two_factors khi bảng này có); không có
--    quyền nào trên bảng nghiệp vụ. Mọi policy của cf_auth đòi thêm app.ctx = 'auth' (đặt ở tham số khởi động
--    của pool riêng) → cần CẢ role lẫn ngữ cảnh.
--  * cf_app (withUser / withWorkspace) KHÔNG còn ngữ cảnh auth: chỉ ĐỌC dòng của mình (cột không nhạy cảm),
--    chỉ GHI users.name, users.image, users.locale (+ updated_at); không đụng verifications; không chèn/xóa users.
--    Đổi mật khẩu, email, email_verified, totp_enabled, tạo/xóa phiên chỉ qua luồng Better Auth (cf_auth).
--
-- Đường lùi: GRANT lại các quyền đã REVOKE cho cf_app (xem 0001, 0004, 0007), DROP POLICY *_auth_access và
-- tạo lại policy của 0008; REVOKE mọi quyền của cf_auth. Role cf_auth giữ nguyên (xóa bằng DROP ROLE bởi superuser).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cf_auth') THEN
    RAISE EXCEPTION 'Thiếu role cf_auth: tạo bằng infra/scripts/cf-dev-add-auth-role.sh (dev) hoặc script khởi tạo Postgres (volume mới) trước khi migrate.';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cf_auth', current_database());
END
$$;
--> statement-breakpoint

-- ===== quyền của cf_auth =====
GRANT USAGE ON SCHEMA core TO cf_auth;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.in_auth_context() TO cf_auth;
--> statement-breakpoint
-- users: đọc + chèn; UPDATE theo cột (không is_admin / admin_role: cấp quyền Admin không đi qua adapter).
GRANT SELECT, INSERT ON core.users TO cf_auth;
--> statement-breakpoint
GRANT UPDATE (email, name, email_verified, image, totp_enabled, locale, updated_at) ON core.users TO cf_auth;
--> statement-breakpoint
-- sessions: UPDATE theo cột như 0007 (không sửa is_admin_session / created_at / user_id / token).
GRANT SELECT, INSERT, DELETE ON core.sessions TO cf_auth;
--> statement-breakpoint
GRANT UPDATE (expires_at, updated_at, ip, user_agent) ON core.sessions TO cf_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON core.accounts, core.verifications TO cf_auth;
--> statement-breakpoint

-- ===== policy của cf_auth: cần ngữ cảnh app.ctx = 'auth' =====
CREATE POLICY users_auth_access ON core.users FOR ALL TO cf_auth
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint
CREATE POLICY sessions_auth_access ON core.sessions FOR ALL TO cf_auth
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint
CREATE POLICY accounts_auth_access ON core.accounts FOR ALL TO cf_auth
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint
CREATE POLICY verifications_auth_access ON core.verifications FOR ALL TO cf_auth
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint

-- ===== thu hẹp cf_app =====
DROP POLICY sessions_access ON core.sessions;
--> statement-breakpoint
DROP POLICY accounts_access ON core.accounts;
--> statement-breakpoint
DROP POLICY verifications_access ON core.verifications;
--> statement-breakpoint
DROP POLICY users_select ON core.users;
--> statement-breakpoint
DROP POLICY users_insert ON core.users;
--> statement-breakpoint
DROP POLICY users_update ON core.users;
--> statement-breakpoint

REVOKE ALL ON core.verifications FROM cf_app;
--> statement-breakpoint
REVOKE ALL ON core.sessions, core.accounts FROM cf_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON core.users FROM cf_app;
--> statement-breakpoint
-- Cột nhạy cảm (sessions.token, accounts.password / access_token / refresh_token / id_token) không đọc được bằng cf_app.
GRANT SELECT (id, user_id, expires_at, ip, user_agent, is_admin_session, created_at, updated_at) ON core.sessions TO cf_app;
--> statement-breakpoint
GRANT SELECT (id, user_id, provider_id, account_id, scope, created_at, updated_at) ON core.accounts TO cf_app;
--> statement-breakpoint
GRANT UPDATE (name, image, locale, updated_at) ON core.users TO cf_app;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION core.in_auth_context() FROM cf_app;
--> statement-breakpoint

CREATE POLICY sessions_own_select ON core.sessions FOR SELECT TO cf_app
  USING (
    (SELECT core.current_workspace_id()) IS NULL
    AND (SELECT core.current_user_id()) IS NOT NULL
    AND user_id = (SELECT core.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY accounts_own_select ON core.accounts FOR SELECT TO cf_app
  USING (
    (SELECT core.current_workspace_id()) IS NULL
    AND (SELECT core.current_user_id()) IS NOT NULL
    AND user_id = (SELECT core.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY users_app_select ON core.users FOR SELECT TO cf_app USING (
  (
    (SELECT core.current_workspace_id()) IS NULL
    AND (SELECT core.current_user_id()) IS NOT NULL
    AND id = (SELECT core.current_user_id())
  )
  OR (
    (SELECT core.current_workspace_id()) IS NOT NULL
    AND id IN (
      SELECT m.user_id FROM core.members m
      WHERE m.workspace_id = (SELECT core.current_workspace_id()) AND m.status = 'active'
    )
  )
);
--> statement-breakpoint
CREATE POLICY users_app_update ON core.users FOR UPDATE TO cf_app
  USING (
    (SELECT core.current_workspace_id()) IS NULL
    AND (SELECT core.current_user_id()) IS NOT NULL
    AND id = (SELECT core.current_user_id())
  )
  WITH CHECK (
    (SELECT core.current_workspace_id()) IS NULL
    AND (SELECT core.current_user_id()) IS NOT NULL
    AND id = (SELECT core.current_user_id())
  );

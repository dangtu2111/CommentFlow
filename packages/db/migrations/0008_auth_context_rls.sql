-- RLS cho các bảng xác thực: users, sessions, accounts, verifications (docs/10 §4, gap AUTH-RLS-OWN).
-- Ngữ cảnh RÕ RÀNG, không có "không ngữ cảnh = thấy hết":
--   app.ctx = 'auth'  (withAuthContext / pool riêng của adapter Better Auth) → thấy và ghi tất cả
--   app.user_id (withUser)                                                  → chỉ dòng của mình
--   app.workspace_id (withWorkspace)                                        → không thấy sessions/accounts/verifications;
--                                                                              users chỉ thành viên 'active' của workspace
--   không ngữ cảnh                                                          → 0 dòng
-- Điều kiện "của mình" luôn đòi ws IS NULL AND u IS NOT NULL: đặt cả hai biến vẫn không mở rộng quyền.
-- Chủ sở hữu bảng (cf_owner, migration) không bị ảnh hưởng (không FORCE).
-- Đường lùi: DROP POLICY ... và ALTER TABLE ... DISABLE ROW LEVEL SECURITY cho bốn bảng; DROP FUNCTION core.in_auth_context().

CREATE FUNCTION core.in_auth_context() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT COALESCE(current_setting('app.ctx', true), '') = 'auth' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.in_auth_context() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.in_auth_context() TO cf_app;
--> statement-breakpoint

-- ===== sessions, accounts (cột user_id) =====
ALTER TABLE core.sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sessions_access ON core.sessions
  USING (
    (SELECT core.in_auth_context())
    OR (
      (SELECT core.current_workspace_id()) IS NULL
      AND (SELECT core.current_user_id()) IS NOT NULL
      AND user_id = (SELECT core.current_user_id())
    )
  )
  WITH CHECK (
    (SELECT core.in_auth_context())
    OR (
      (SELECT core.current_workspace_id()) IS NULL
      AND (SELECT core.current_user_id()) IS NOT NULL
      AND user_id = (SELECT core.current_user_id())
    )
  );
--> statement-breakpoint
ALTER TABLE core.accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY accounts_access ON core.accounts
  USING (
    (SELECT core.in_auth_context())
    OR (
      (SELECT core.current_workspace_id()) IS NULL
      AND (SELECT core.current_user_id()) IS NOT NULL
      AND user_id = (SELECT core.current_user_id())
    )
  )
  WITH CHECK (
    (SELECT core.in_auth_context())
    OR (
      (SELECT core.current_workspace_id()) IS NULL
      AND (SELECT core.current_user_id()) IS NOT NULL
      AND user_id = (SELECT core.current_user_id())
    )
  );
--> statement-breakpoint

-- ===== verifications: chỉ ngữ cảnh auth =====
ALTER TABLE core.verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY verifications_access ON core.verifications
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint

-- ===== users =====
ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_select ON core.users FOR SELECT USING (
  (SELECT core.in_auth_context())
  OR (
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
CREATE POLICY users_insert ON core.users FOR INSERT WITH CHECK (
  (SELECT core.in_auth_context())
  OR (
    (SELECT core.current_workspace_id()) IS NULL
    AND (SELECT core.current_user_id()) IS NOT NULL
    AND id = (SELECT core.current_user_id())
  )
);
--> statement-breakpoint
CREATE POLICY users_update ON core.users FOR UPDATE
  USING (
    (SELECT core.in_auth_context())
    OR (
      (SELECT core.current_workspace_id()) IS NULL
      AND (SELECT core.current_user_id()) IS NOT NULL
      AND id = (SELECT core.current_user_id())
    )
  )
  WITH CHECK (
    (SELECT core.in_auth_context())
    OR (
      (SELECT core.current_workspace_id()) IS NULL
      AND (SELECT core.current_user_id()) IS NOT NULL
      AND id = (SELECT core.current_user_id())
    )
  );

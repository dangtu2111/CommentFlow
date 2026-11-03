-- Ngữ cảnh NGƯỜI GỌI trong RLS (feat/rls-actor-ctx, ADR 005 §3): DB biết `app.user_id` (do withActor() đặt cùng
-- `app.workspace_id`) nên các thao tác chỉ-Owner không còn phụ thuộc việc mã ứng dụng nhớ kiểm quyền.
--
--  * core.is_workspace_owner()   — người gọi là Owner `active` của workspace hiện tại.
--  * core.is_workspace_member()  — người gọi là thành viên `active` của workspace hiện tại.
--  * core.workspace_has_members(uuid) — workspace đã có thành viên nào chưa (đường khởi tạo Owner đầu tiên).
--    Cả ba SECURITY DEFINER (đọc `members` không đệ quy RLS), STABLE, search_path cố định có pg_temp,
--    REVOKE ALL FROM PUBLIC, GRANT EXECUTE chỉ cho cf_app.
--  * Policy chỉ-Owner: members (INSERT/UPDATE), invitations (SELECT/INSERT/UPDATE), workspaces (UPDATE);
--    members INSERT còn một đường khởi tạo: người tạo tự thêm mình làm Owner khi workspace chưa có thành viên.
--  * action_logs INSERT: actor_type='user' đòi actor_id = người gọi và người gọi là thành viên active;
--    actor_type khác chỉ khi KHÔNG có người dùng (job hệ thống).
--  * invitations.token_hash: cf_app không đọc được (xem trước/nhận lời mời đi qua hàm DEFINER ở 0015).
--
-- Giới hạn: `app.user_id` vẫn do mã ứng dụng đặt — chống quên kiểm quyền / sai id, không chống tiến trình web bị
-- chiếm hoàn toàn (ADR 005 §3). Triển khai CÙNG LÚC với mã mới: mã cũ dùng withWorkspace() sẽ không ghi được các
-- bảng trên.
--
-- Đường lùi: tạo lại policy bản 0001/0015 (members_insert/update, invitations_select/insert/update, workspaces_update,
-- action_logs_insert), GRANT SELECT (token_hash) / GRANT SELECT ON core.invitations TO cf_app, rồi
-- DROP FUNCTION core.is_workspace_owner(), core.is_workspace_member(), core.workspace_has_members(uuid).

CREATE FUNCTION core.is_workspace_owner() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.members m
    WHERE m.workspace_id = core.current_workspace_id()
      AND m.user_id = core.current_user_id()
      AND m.role = 'owner'
      AND m.status = 'active'
  )
$$;
--> statement-breakpoint
CREATE FUNCTION core.is_workspace_member() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.members m
    WHERE m.workspace_id = core.current_workspace_id()
      AND m.user_id = core.current_user_id()
      AND m.status = 'active'
  )
$$;
--> statement-breakpoint
CREATE FUNCTION core.workspace_has_members(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM core.members m WHERE m.workspace_id = p_workspace_id)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.is_workspace_owner() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.is_workspace_member() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.workspace_has_members(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.is_workspace_owner() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.is_workspace_member() TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.workspace_has_members(uuid) TO cf_app;
--> statement-breakpoint

-- ===== members: ghi chỉ Owner (hoặc đường khởi tạo) =====
DROP POLICY members_insert ON core.members;
--> statement-breakpoint
CREATE POLICY members_insert ON core.members FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_workspace_owner())
      OR (
        role = 'owner'
        AND user_id = (SELECT core.current_user_id())
        AND NOT (SELECT core.workspace_has_members(workspace_id))
      )
    )
  );
--> statement-breakpoint
DROP POLICY members_update ON core.members;
--> statement-breakpoint
CREATE POLICY members_update ON core.members FOR UPDATE
  USING (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_owner()))
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_owner()));
--> statement-breakpoint

-- ===== invitations: đọc/ghi chỉ Owner (giữ điều kiện cột của 0015) =====
DROP POLICY invitations_select ON core.invitations;
--> statement-breakpoint
CREATE POLICY invitations_select ON core.invitations FOR SELECT
  USING (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_owner()));
--> statement-breakpoint
DROP POLICY invitations_insert ON core.invitations;
--> statement-breakpoint
CREATE POLICY invitations_insert ON core.invitations FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_owner())
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  );
--> statement-breakpoint
DROP POLICY invitations_update ON core.invitations;
--> statement-breakpoint
CREATE POLICY invitations_update ON core.invitations FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_owner())
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_owner())
    AND revoked_at IS NOT NULL
  );
--> statement-breakpoint
-- token_hash: cf_app không đọc được (chỉ hàm DEFINER ở 0015 so khớp băm).
REVOKE SELECT ON core.invitations FROM cf_app;
--> statement-breakpoint
GRANT SELECT (id, workspace_id, email, role, expires_at, accepted_at, revoked_at, invited_by, created_at)
  ON core.invitations TO cf_app;
--> statement-breakpoint

-- ===== workspaces: sửa chỉ Owner =====
DROP POLICY workspaces_update ON core.workspaces;
--> statement-breakpoint
CREATE POLICY workspaces_update ON core.workspaces FOR UPDATE
  USING (id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_owner()))
  WITH CHECK (id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_owner()));
--> statement-breakpoint

-- ===== action_logs: người ghi không giả được người khác =====
DROP POLICY action_logs_insert ON core.action_logs;
--> statement-breakpoint
CREATE POLICY action_logs_insert ON core.action_logs FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (
        actor_type = 'user'
        AND actor_id = (SELECT core.current_user_id())
        AND (SELECT core.is_workspace_member())
      )
      OR (actor_type <> 'user' AND (SELECT core.current_user_id()) IS NULL)
    )
  );

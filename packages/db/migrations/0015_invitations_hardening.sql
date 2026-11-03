ALTER TABLE "core"."invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."invitations" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "core"."invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_unique" ON "core"."invitations" USING btree ("workspace_id","email") WHERE "core"."invitations"."accepted_at" is null and "core"."invitations"."revoked_at" is null;--> statement-breakpoint
-- ===================================================================================================
-- Phần viết tay (feat/workspace-members). Đường lùi ở cuối file.
--
--  1) Quyền cf_app trên invitations: chỉ SELECT/INSERT + UPDATE đúng cột revoked_at (thu hồi); không DELETE.
--     token_hash/email/role/expires_at/accepted_at KHÔNG sửa được sau khi tạo; INSERT không được tạo sẵn lời mời
--     đã dùng/đã thu hồi. Policy tách theo lệnh (check-rls đòi policy đúng lệnh cho mỗi quyền).
--  2) core.invitation_preview(token_hash) và core.accept_invitation(token_hash): SECURITY DEFINER, search_path cố
--     định, chỉ EXECUTE cho cf_app. accept_invitation KHÔNG nhận email hay user id: người dùng lấy từ app.user_id
--     (withUser, từ phiên server), email so khớp được đọc từ core.users ngay trong hàm. Mọi ca không hợp lệ trả
--     CÙNG kết quả: không có dòng nào.
--  3) Trigger core.guard_last_owner: workspace không bao giờ mất Owner `active` cuối cùng (kể cả hai giao dịch
--     song song: khóa dòng workspaces để tuần tự hóa).
-- ===================================================================================================

REVOKE UPDATE, DELETE ON core.invitations FROM cf_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at) ON core.invitations TO cf_app;
--> statement-breakpoint
DROP POLICY invitations_isolation ON core.invitations;
--> statement-breakpoint
CREATE POLICY invitations_select ON core.invitations FOR SELECT
  USING (workspace_id = (SELECT core.current_workspace_id()));
--> statement-breakpoint
CREATE POLICY invitations_insert ON core.invitations FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  );
--> statement-breakpoint
CREATE POLICY invitations_update ON core.invitations FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND revoked_at IS NOT NULL
  );
--> statement-breakpoint

-- Xem trước lời mời (trang /invite/<token> trước khi đăng nhập): chỉ tên workspace + vai trò, và chỉ khi lời
-- mời còn hiệu lực. Không trả email được mời. Không hợp lệ (sai, hết hạn, đã dùng, đã thu hồi) → không có dòng.
CREATE FUNCTION core.invitation_preview(p_token_hash text)
RETURNS TABLE (workspace_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT w.name, i.role
  FROM core.invitations i
  JOIN core.workspaces w ON w.id = i.workspace_id
  WHERE i.token_hash = p_token_hash
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND w.status <> 'deleted'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.invitation_preview(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.invitation_preview(text) TO cf_app;
--> statement-breakpoint

-- Nhận lời mời. Điều kiện (mọi điều kiện sai → không trả dòng nào, không phân biệt lý do):
--   có app.user_id và KHÔNG có app.workspace_id (đúng ngữ cảnh withUser); lời mời còn hiệu lực; người dùng có
--   email đã xác minh và email KHỚP email được mời; không phải thành viên đang bị tạm khóa.
-- Hiệu ứng (một giao dịch): thêm thành viên `active` (hoặc kích hoạt lại / áp vai trò của lời mời cho thành viên
-- cũ), đánh dấu lời mời đã dùng, ghi action_logs. Trả (workspace, vai trò mới, vai trò cũ nếu đang active, người mời). Tên cột trả về khác tên cột bảng để plpgsql không nhập nhằng.
CREATE FUNCTION core.accept_invitation(p_token_hash text)
RETURNS TABLE (accepted_workspace_id uuid, accepted_role text, previous_role text, inviter_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_inv core.invitations%ROWTYPE;
  v_email text;
  v_verified boolean;
  v_member core.members%ROWTYPE;
  v_prev_role text;
  v_prev_status text;
BEGIN
  IF v_user IS NULL OR core.current_workspace_id() IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_inv
  FROM core.invitations i
  WHERE i.token_hash = p_token_hash
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = i.workspace_id AND w.status <> 'deleted')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT u.email::text, u.email_verified INTO v_email, v_verified FROM core.users u WHERE u.id = v_user;
  IF NOT FOUND OR v_verified IS NOT TRUE OR lower(v_email) <> lower(v_inv.email::text) THEN
    RETURN;
  END IF;

  SELECT * INTO v_member
  FROM core.members m
  WHERE m.workspace_id = v_inv.workspace_id AND m.user_id = v_user
  FOR UPDATE;
  IF FOUND THEN
    IF v_member.status = 'suspended' THEN
      RETURN;
    END IF;
    v_prev_role := v_member.role;
    v_prev_status := v_member.status;
    UPDATE core.members m
    SET role = CASE WHEN v_member.status = 'active' AND v_member.role = 'owner' THEN 'owner' ELSE v_inv.role END,
        status = 'active',
        invited_by = COALESCE(v_inv.invited_by, v_member.invited_by),
        updated_at = now()
    WHERE m.id = v_member.id;
  ELSE
    INSERT INTO core.members (workspace_id, user_id, role, invited_by, status)
    VALUES (v_inv.workspace_id, v_user, v_inv.role, v_inv.invited_by, 'active');
  END IF;

  UPDATE core.invitations i SET accepted_at = now() WHERE i.id = v_inv.id;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, before, after)
  VALUES (
    v_inv.workspace_id, 'user', v_user, 'invitation.accepted', 'invitation', v_inv.id::text,
    CASE WHEN v_prev_role IS NULL THEN NULL
         ELSE jsonb_build_object('role', v_prev_role, 'status', v_prev_status) END,
    jsonb_build_object('role', CASE WHEN v_prev_status = 'active' AND v_prev_role = 'owner' THEN 'owner' ELSE v_inv.role END, 'status', 'active')
  );

  accepted_workspace_id := v_inv.workspace_id;
  accepted_role := CASE WHEN v_prev_status = 'active' AND v_prev_role = 'owner' THEN 'owner' ELSE v_inv.role END;
  previous_role := CASE WHEN v_prev_status = 'active' THEN v_prev_role ELSE NULL END;
  inviter_id := v_inv.invited_by;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.accept_invitation(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.accept_invitation(text) TO cf_app;
--> statement-breakpoint

-- Workspace luôn còn ít nhất một Owner `active`.
CREATE FUNCTION core.guard_last_owner() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_remaining integer;
BEGIN
  -- Xóa cứng cả workspace (cascade) không bị chặn: dòng workspaces đã biến mất trong cùng giao dịch.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = OLD.workspace_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.role = 'owner' AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.status <> 'active' OR NEW.workspace_id <> OLD.workspace_id)
  THEN
    -- Tuần tự hóa các giao dịch cùng gỡ/hạ Owner của một workspace. FOR NO KEY UPDATE (không phải FOR UPDATE) để không
    -- xung đột với khóa FOR KEY SHARE của INSERT vào bảng con (members, action_logs...) → không deadlock. Thứ tự khóa: workspace rồi members.
    -- Chỉ đúng ở READ COMMITTED (mặc định của withWorkspace/withUser).
    PERFORM 1 FROM core.workspaces w WHERE w.id = OLD.workspace_id FOR NO KEY UPDATE;
    SELECT count(*) INTO v_remaining
    FROM core.members m
    WHERE m.workspace_id = OLD.workspace_id AND m.role = 'owner' AND m.status = 'active' AND m.id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'last_owner' USING ERRCODE = 'check_violation', CONSTRAINT = 'members_last_owner';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.guard_last_owner() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER members_guard_last_owner
  BEFORE UPDATE OR DELETE ON core.members
  FOR EACH ROW EXECUTE FUNCTION core.guard_last_owner();

-- Đường lùi (theo thứ tự): DROP TRIGGER members_guard_last_owner ON core.members; DROP FUNCTION core.guard_last_owner();
-- DROP FUNCTION core.accept_invitation(text); DROP FUNCTION core.invitation_preview(text);
-- DROP POLICY invitations_select/insert/update; CREATE POLICY invitations_isolation (mẫu 0001);
-- REVOKE UPDATE (revoked_at) ON core.invitations FROM cf_app; GRANT UPDATE, DELETE ON core.invitations TO cf_app;
-- DROP INDEX core.invitations_pending_email_unique; ALTER TABLE core.invitations DROP COLUMN invited_by, DROP COLUMN revoked_at.

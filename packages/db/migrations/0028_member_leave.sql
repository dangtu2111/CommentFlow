-- ===================================================================================================
-- MEMBER-LEAVE (FR-003) + LOG-RLS-STAFF (FR-092) — feat/member-leave.
--
--  1) core.leave_workspace(p_workspace_id uuid): thành viên TỰ rời workspace. SECURITY DEFINER (policy members_update
--     chỉ cho Owner nên Staff không tự UPDATE được), search_path cố định, REVOKE PUBLIC, GRANT EXECUTE chỉ cf_app.
--     KHÔNG nhận user id: người rời = core.current_user_id() (app.user_id do server đặt từ phiên). Ngữ cảnh: có người
--     dùng; app.workspace_id NULL (withUser) hoặc trùng tham số (withActor); không phải đường hệ thống. Sai → 42501.
--     Luồng: khóa tư vấn theo workspace (tuần tự hóa các lần rời/gỡ Owner) → khóa dòng thành viên `active` của người
--     gọi (không có → CF404, gồm đã rời/đã gỡ/tạm khóa/người lạ) → nếu là Owner mà KHÔNG còn Owner `active` khác thì
--     check_violation + constraint members_last_owner (cùng mã với trigger guard_last_owner nên saas-core ánh xạ chung)
--     → status='removed' (giữ dòng, như gỡ thành viên) → ghi action_logs `member.left` (actor = người rời).
--     Trigger members_guard_last_owner vẫn là lưới an toàn thứ hai. Trả vai trò lúc rời (để báo Owner).
--  2) action_logs SELECT: Owner thấy cả workspace; Staff chỉ dòng `actor_type='user'` do chính mình làm; đường hệ
--     thống (withJob/withSystem trong ngữ cảnh workspace) đọc được. `withWorkspace` trần (không người dùng) KHÔNG đọc
--     được nữa. Người đã rời/bị tạm khóa không phải thành viên active nên không đọc được gì.
--
-- TRIỂN KHAI: migrate rồi chạy web bản mới (web cũ không gọi hàm mới; mã đọc nhật ký bằng withWorkspace trần phải đổi
-- sang withActor — trong repo không có chỗ nào như vậy ngoài test).
--
-- Đường lùi: LÙI CODE TRƯỚC (web gọi leave_workspace); DROP FUNCTION core.leave_workspace(uuid); DROP POLICY
-- action_logs_select ON core.action_logs; CREATE POLICY action_logs_select ON core.action_logs FOR SELECT
-- USING (workspace_id = (SELECT core.current_workspace_id())) (bản 0001).
-- PHẢI lùi CẢ check-rls (packages/db/src/check-rls.ts: các mục ACTOR_POLICIES của core.action_logs 'r' và hàm
-- checkLeaveFunction), nếu không `pnpm db:check-rls` đỏ. HỆ QUẢ khi lùi: Staff lại đọc được MỌI dòng nhật ký của
-- workspace ở tầng RLS (chỉ còn lọc ở truy vấn listActionLogs); các dòng `member.left` đã ghi và thành viên đã
-- `removed` KHÔNG hoàn tác được (muốn quay lại phải được mời lại).
-- ===================================================================================================

CREATE FUNCTION core.leave_workspace(p_workspace_id uuid)
RETURNS TABLE (left_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_ctx_ws uuid := core.current_workspace_id();
  v_member core.members%ROWTYPE;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL
     OR (v_ctx_ws IS NOT NULL AND v_ctx_ws <> p_workspace_id)
     OR core.is_system_context() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- Tuần tự hóa mọi lần rời của một workspace (xả khi kết thúc giao dịch).
  PERFORM pg_advisory_xact_lock(hashtextextended('core.leave_workspace:' || p_workspace_id::text, 0));

  SELECT * INTO v_member
  FROM core.members m
  WHERE m.workspace_id = p_workspace_id AND m.user_id = v_user AND m.status = 'active'
  FOR NO KEY UPDATE; -- không có FK nào trỏ vào members.id; không chặn INSERT bảng con (FOR KEY SHARE)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'CF404';
  END IF;

  IF v_member.role = 'owner'
     AND NOT EXISTS (
       SELECT 1 FROM core.members o
       WHERE o.workspace_id = p_workspace_id AND o.role = 'owner' AND o.status = 'active' AND o.id <> v_member.id
     )
  THEN
    RAISE EXCEPTION 'last_owner' USING ERRCODE = 'check_violation', CONSTRAINT = 'members_last_owner';
  END IF;

  UPDATE core.members m SET status = 'removed', updated_at = now() WHERE m.id = v_member.id;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, before, after)
  VALUES (
    p_workspace_id, 'user', v_user, 'member.left', 'member', v_member.id::text,
    jsonb_build_object('role', v_member.role, 'status', 'active'),
    jsonb_build_object('role', v_member.role, 'status', 'removed')
  );

  left_role := v_member.role;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.leave_workspace(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.leave_workspace(uuid) TO cf_app;
--> statement-breakpoint

-- Giới hạn thời gian chờ khóa chỉ cho bước đổi policy (DROP/CREATE cần khóa ngắn trên action_logs); trả về mặc định sau đó.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DROP POLICY action_logs_select ON core.action_logs;
--> statement-breakpoint
CREATE POLICY action_logs_select ON core.action_logs FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (SELECT core.is_system_context())
      OR (SELECT core.is_workspace_owner())
      OR (
        actor_type = 'user'
        AND actor_id = (SELECT core.current_user_id())
        AND (SELECT core.is_workspace_member())
      )
    )
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

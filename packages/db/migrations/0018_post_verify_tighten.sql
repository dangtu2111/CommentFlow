-- Siết thêm sau kiểm chứng độc lập của feat/members-invite-only (verifier-db):
--  1) members_update: Owner KHÔNG sửa được dòng đã `removed` (USING loại dòng đó → 0 dòng, kể cả đường
--     INSERT ... ON CONFLICT DO UPDATE). Đưa người đã rời trở lại chỉ qua lời mời (`accept_invitation`, DEFINER).
--     `suspended` → `active` (mở khóa) vẫn làm được.
--  2) members_insert: đường khởi tạo đòi `status = 'active'` (không tự chèn Owner `removed`/`suspended` để phá
--     bất biến "luôn có ≥ 1 Owner active").
--  3) workspaces: cf_app chỉ UPDATE các cột Owner được phép tự đổi (name, slug, timezone, default_lang, ai_enabled,
--     updated_at). Không sửa được status (thanh toán/Admin), ai_cost_cap_usd, emergency_stopped_at (sẽ có đường riêng
--     khi làm tính năng đó), created_by, created_at, id.
--
-- Đường lùi: tạo lại members_update/members_insert bản 0016/0017 (không có `status`), và
-- `GRANT UPDATE ON core.workspaces TO cf_app` (toàn cột); hoàn lại check-rls tương ứng.
DROP POLICY members_update ON core.members;
--> statement-breakpoint
CREATE POLICY members_update ON core.members FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_workspace_owner())
    AND status <> 'removed'
  )
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_owner()));
--> statement-breakpoint
DROP POLICY members_insert ON core.members;
--> statement-breakpoint
CREATE POLICY members_insert ON core.members FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND role = 'owner'
    AND status = 'active'
    AND user_id = (SELECT core.current_user_id())
    AND invited_by IS NULL
    AND (SELECT core.workspace_bootstrap_open())
  );
--> statement-breakpoint
REVOKE UPDATE ON core.workspaces FROM cf_app;
--> statement-breakpoint
GRANT UPDATE (name, slug, timezone, default_lang, ai_enabled, updated_at) ON core.workspaces TO cf_app;

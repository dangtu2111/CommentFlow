-- Thành viên chỉ vào qua LỜI MỜI (feat/members-invite-only, ADR 005 §1, §3; gap matrix MEMBER-DIRECT-ADD).
-- Trước đây policy `members_insert` (0016) cho Owner INSERT thẳng một người vào workspace mà người đó không đồng ý.
-- Nay chỉ còn ĐƯỜNG KHỞI TẠO: người tạo workspace tự thêm mình làm `owner` khi workspace do chính họ tạo
-- (`workspaces.created_by`) và chưa có thành viên (`workspace_bootstrap_open()`), và không giả người mời (`invited_by` NULL).
-- Mọi trường hợp khác (nhận lời mời, kích hoạt lại) đi qua hàm DEFINER `core.accept_invitation` (0015) — chạy quyền
-- chủ bảng nên không bị policy này chặn. Không đổi cột, không đổi quyền.
--
-- Đường lùi: tạo lại `members_insert` bản 0016 (thêm nhánh `(SELECT core.is_workspace_owner())` và điều kiện
-- `invited_by IS NULL OR invited_by = (SELECT core.current_user_id())`).
DROP POLICY members_insert ON core.members;
--> statement-breakpoint
CREATE POLICY members_insert ON core.members FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND role = 'owner'
    AND user_id = (SELECT core.current_user_id())
    AND invited_by IS NULL
    AND (SELECT core.workspace_bootstrap_open())
  );

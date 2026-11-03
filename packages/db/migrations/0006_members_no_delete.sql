-- Thành viên bị gỡ chuyển sang status = 'removed' và GIỮ dòng (lịch sử, action_logs, invited_by);
-- role ứng dụng không xóa cứng được dòng members (chốt 03/11).
-- Đường lùi: GRANT DELETE ON core.members TO cf_app và tạo lại policy members_delete (xem 0001).
DROP POLICY members_delete ON core.members;
--> statement-breakpoint
REVOKE DELETE ON core.members FROM cf_app;

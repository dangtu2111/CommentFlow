-- ===================================================================================================
-- LOG-STAFF-SYSTEM-ROWS (FR-092) — feat/log-on-behalf-of.
--
--  1) Cột core.action_logs.on_behalf_of (uuid, NULL được): người đã YÊU CẦU việc mà đường hệ thống (worker) thực hiện
--     (gửi trả lời, ẩn/bỏ ẩn bình luận — dòng `comment.replied`/`comment.hidden`/`comment.unhidden`, actor_type='system').
--     KHÔNG có khóa ngoại (theo quy ước của bảng: actor_id, impersonation_id cũng là uuid trần; nhật ký chỉ-thêm không
--     được chặn hay cascade theo người dùng). CHECK action_logs_on_behalf_of_check: chỉ dòng actor_type='system' mới được
--     có on_behalf_of (áp cả cho chủ bảng và hàm DEFINER). Bảng chỉ INSERT với cf_app (không UPDATE/DELETE) → cột không
--     sửa được sau khi ghi.
--  2) Ai được GHI: chỉ đường hệ thống. Policy INSERT từ 0016 chỉ cho actor_type 'system'/'ai' khi KHÔNG có người dùng
--     (app.user_id NULL, tức withJob/withSystem) → withActor không ghi được dòng system; nhánh 'user' nay đòi thêm
--     on_behalf_of IS NULL (rõ ràng, check-rls kiểm) nên người dùng không tự đặt người khác để ép/giả cho họ nhìn.
--  3) action_logs SELECT: như 0028 + Staff (thành viên active) thấy thêm dòng actor_type='system' có on_behalf_of =
--     mình. Staff KHÔNG thấy dòng 'ai', dòng của người khác, dòng system không có on_behalf_of. Owner thấy cả workspace;
--     đường hệ thống đọc được; withWorkspace trần không đọc; người đã rời/tạm khóa không đọc.
--  4) Backfill: dòng system cũ (comment.replied/hidden/unhidden) có after.requested_by đúng dạng uuid → on_behalf_of.
--     Chạy bằng chủ bảng (migration) nên không đụng quyền cf_app; dòng không có/sai dạng giữ NULL.
--
-- Chỉ mục: KHÔNG tạo ở đây (CREATE INDEX khóa bảng chỉ-thêm đang ghi; CONCURRENTLY không chạy trong giao dịch migrate).
-- Theo dõi cùng ACTION-LOGS-ACTOR-INDEX (gap matrix).
--
-- TRIỂN KHAI: migrate rồi bật worker/web bản mới. Worker cũ vẫn ghi hợp lệ (cột nullable) nhưng dòng mới không hiện cho Staff.
--
-- Đường lùi: LÙI CODE TRƯỚC (worker ghi on_behalf_of, truy vấn Nhật ký đọc cột); DROP POLICY action_logs_select và
-- action_logs_insert rồi tạo lại bản 0028 (select) và 0016 (insert); ALTER TABLE core.action_logs DROP CONSTRAINT
-- action_logs_on_behalf_of_check, DROP COLUMN on_behalf_of. PHẢI lùi CẢ check-rls (marker on_behalf_of của action_logs
-- 'r' và 'a' trong ACTOR_POLICIES), nếu không `pnpm db:check-rls` đỏ. HỆ QUẢ khi lùi: Staff không còn thấy dòng hệ thống
-- do mình yêu cầu; mất thông tin on_behalf_of (vẫn còn after.requested_by của dòng comment.*).
-- ===================================================================================================

ALTER TABLE core.action_logs ADD COLUMN on_behalf_of uuid;
--> statement-breakpoint
ALTER TABLE core.action_logs
  ADD CONSTRAINT action_logs_on_behalf_of_check CHECK (on_behalf_of IS NULL OR actor_type = 'system');
--> statement-breakpoint

UPDATE core.action_logs
   SET on_behalf_of = CASE
         WHEN after ->> 'requested_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (after ->> 'requested_by')::uuid END
 WHERE actor_type = 'system' AND on_behalf_of IS NULL
   AND action IN ('comment.replied', 'comment.hidden', 'comment.unhidden');
--> statement-breakpoint

-- Giới hạn thời gian chờ khóa chỉ cho bước đổi policy; trả về mặc định sau đó.
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
        (
          (actor_type = 'user' AND actor_id = (SELECT core.current_user_id()))
          OR (actor_type = 'system' AND on_behalf_of = (SELECT core.current_user_id()))
        )
        AND (SELECT core.is_workspace_member())
      )
    )
  );
--> statement-breakpoint
DROP POLICY action_logs_insert ON core.action_logs;
--> statement-breakpoint
CREATE POLICY action_logs_insert ON core.action_logs FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      (
        actor_type = 'user'
        AND actor_id = (SELECT core.current_user_id())
        AND on_behalf_of IS NULL
        AND (SELECT core.is_workspace_member())
      )
      OR (
        actor_type IN ('system', 'ai')
        AND actor_id IS NULL
        AND (SELECT core.current_user_id()) IS NULL
      )
    )
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

-- ===================================================================================================
-- LOG-STAFF-SYSTEM-ROWS (FR-092) — feat/log-on-behalf-of.
--
--  1) Cột core.action_logs.on_behalf_of (uuid, NULL được): người đã YÊU CẦU việc mà đường hệ thống (worker) thực hiện
--     (gửi trả lời, ẩn/bỏ ẩn bình luận — dòng `comment.replied`/`comment.hidden`/`comment.unhidden`, actor_type='system').
--     KHÔNG có khóa ngoại (theo quy ước của bảng: actor_id, impersonation_id cũng là uuid trần; nhật ký chỉ-thêm không
--     được chặn hay cascade theo người dùng). CHECK action_logs_on_behalf_of_check: chỉ dòng actor_type='system' mới được
--     có on_behalf_of; ràng buộc CHECK áp cho MỌI đường ghi kể cả chủ bảng (hàm DEFINER bỏ qua RLS nhưng không bỏ qua CHECK).
--     Bảng chỉ INSERT với cf_app (không UPDATE/DELETE) → cột không sửa được sau khi ghi.
--  2) Ai được GHI: chỉ đường hệ thống. Policy INSERT nhánh 'system'/'ai' nay đòi core.is_system_context() (withJob:
--     app.ctx='system', không có app.user_id) — withWorkspace TRẦN không còn ghi được dòng system/ai (trước đây chỉ đòi
--     không có người dùng nên ngữ cảnh trần ghi được và có thể đặt on_behalf_of tùy ý). Mọi nơi ghi hợp lệ đã kiểm: worker
--     (ingest/send/hide) đều withJob; saas-core ghi actor_type='user' qua withActor; các hàm DEFINER chỉ ghi 'user'.
--     Nhánh 'user' đòi thêm on_behalf_of IS NULL (người dùng không tự đặt người khác để ép/giả cho họ nhìn).
--  3) action_logs SELECT: như 0028 + Staff (thành viên active) thấy thêm dòng actor_type='system' có on_behalf_of =
--     mình. Staff KHÔNG thấy dòng 'ai', dòng của người khác, dòng system không có on_behalf_of. Owner thấy cả workspace;
--     đường hệ thống đọc được; withWorkspace trần không đọc; người đã rời/tạm khóa không đọc.
--  4) Backfill: dòng system cũ (comment.replied/hidden/unhidden) có after.requested_by đúng dạng uuid → on_behalf_of.
--     Chạy bằng chủ bảng (migration). Dòng không có/sai dạng giữ NULL. Câu backfill idempotent.
--
-- KHÓA VÀ GIAO DỊCH: runner (drizzle migrate) chạy cả đợt migration trong MỘT giao dịch, nên các khóa ACCESS EXCLUSIVE của
-- ADD COLUMN / ADD CONSTRAINT / DROP+CREATE POLICY được giữ tới khi commit, kể cả thời gian backfill và VALIDATE. Vì vậy
-- `lock_timeout = 5s` đặt ở ĐẦU file (SET LOCAL, hiệu lực cả giao dịch; migration thất bại rõ ràng thay vì xếp hàng chặn mọi
-- INSERT). CHECK thêm bằng NOT VALID rồi VALIDATE (bước quét bảng thường chỉ cần khóa nhẹ SHARE UPDATE EXCLUSIVE nhưng vẫn
-- nằm trong giao dịch chung). Chấp nhận khi bảng nhỏ (dev/staging hiện tại); TRƯỚC khi chạy staging/production: SELECT
-- count(*) FROM core.action_logs; nếu lớn (cỡ trăm nghìn dòng trở lên) → tách backfill + VALIDATE thành migration riêng hoặc
-- chạy ngoài giờ cao điểm. Sau backfill trên bảng lớn nên VACUUM (ANALYZE) core.action_logs.
--
-- Chỉ mục: KHÔNG tạo ở đây (CREATE INDEX khóa bảng chỉ-thêm đang ghi; CONCURRENTLY không chạy trong giao dịch migrate).
-- Theo dõi cùng ACTION-LOGS-ACTOR-INDEX (gap matrix).
--
-- TRIỂN KHAI: migrate rồi BẬT WORKER/WEB BẢN MỚI NGAY. Worker cũ vẫn ghi hợp lệ (cột nullable) nhưng dòng nó ghi trong
-- khoảng hở không có on_behalf_of (Staff chưa thấy). Sau khi worker mới chạy ổn, CHẠY LẠI đúng câu backfill ở dưới một lần
-- (idempotent) cho các dòng đó — gap ACTION-LOGS-BACKFILL-RERUN.
--
-- Đường lùi: LÙI CODE TRƯỚC (worker ghi on_behalf_of, truy vấn Nhật ký đọc cột); DROP POLICY action_logs_select và
-- action_logs_insert rồi tạo lại bản 0028 (select) và 0016 (insert); ALTER TABLE core.action_logs DROP CONSTRAINT
-- action_logs_on_behalf_of_check, DROP COLUMN on_behalf_of. PHẢI lùi CẢ check-rls (marker on_behalf_of/is_system_context của
-- action_logs 'r' và 'a' trong ACTOR_POLICIES và kiểm CHECK) nếu không `pnpm db:check-rls` đỏ. HỆ QUẢ khi lùi: Staff không
-- còn thấy dòng hệ thống do mình yêu cầu; mất thông tin on_behalf_of (vẫn còn after.requested_by của dòng comment.*).
-- ===================================================================================================

SET LOCAL lock_timeout = '5s';
--> statement-breakpoint

ALTER TABLE core.action_logs ADD COLUMN on_behalf_of uuid;
--> statement-breakpoint
ALTER TABLE core.action_logs
  ADD CONSTRAINT action_logs_on_behalf_of_check CHECK (on_behalf_of IS NULL OR actor_type = 'system') NOT VALID;
--> statement-breakpoint
ALTER TABLE core.action_logs VALIDATE CONSTRAINT action_logs_on_behalf_of_check;
--> statement-breakpoint

-- Backfill (idempotent; chạy lại được sau khi worker mới chạy ổn).
UPDATE core.action_logs
   SET on_behalf_of = CASE
         WHEN after ->> 'requested_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (after ->> 'requested_by')::uuid END
 WHERE actor_type = 'system' AND on_behalf_of IS NULL
   AND action IN ('comment.replied', 'comment.hidden', 'comment.unhidden');
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
        AND (SELECT core.is_system_context())
      )
    )
  );

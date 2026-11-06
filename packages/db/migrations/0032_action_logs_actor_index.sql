-- ===================================================================================================
-- ACTION-LOGS-ACTOR-INDEX (feat-action-logs-actor-index; ghi chú từ 0028/0029): hai chỉ mục một phần cho truy vấn Nhật ký
-- của Staff (`viewerConditions` + policy action_logs_select):
--   * (workspace_id, actor_id, created_at DESC) WHERE actor_type = 'user'      — dòng do CHÍNH Staff làm.
--   * (workspace_id, on_behalf_of, created_at DESC) WHERE on_behalf_of IS NOT NULL — dòng hệ thống do Staff yêu cầu (0029).
-- Owner dùng action_logs_workspace_created_idx sẵn có.
--
-- KHÔNG dùng CONCURRENTLY (Q-AI1): runner (drizzle migrate) chạy cả đợt migration trong MỘT giao dịch; CREATE INDEX
-- CONCURRENTLY bị Postgres từ chối trong giao dịch. Thay bằng CREATE INDEX thường + `SET LOCAL lock_timeout = '5s'`
-- (hiệu lực cả giao dịch): CREATE INDEX giữ khóa SHARE chặn INSERT vào action_logs trong lúc dựng chỉ mục; nếu không lấy
-- được khóa trong 5 giây thì migration thất bại rõ ràng (lưu ý: khóa SHARE giữ tới COMMIT cả đợt và lock_timeout chỉ giới
-- hạn thời gian CHỜ khóa, không giới hạn thời gian dựng; SET LOCAL còn áp cho migration xếp sau trong cùng đợt). Khi tạo
-- tay trước, BẮT BUỘC kiểm `indisvalid` và định nghĩa đúng trước khi migrate (IF NOT EXISTS bỏ qua chỉ mục sai/INVALID).
-- Giới hạn đã biết (verifier-db): truy vấn Staff là `(A) OR (B)` + ORDER BY created_at DESC, id DESC nên chỉ mục chủ yếu
-- giúp lọc (BitmapOr), chưa giúp thứ tự; tối ưu UNION ALL + `id DESC` trong khóa để việc sau nếu bảng lớn.
-- Lỗi lấy khóa thì chạy lại, thay vì xếp hàng chặn mọi ghi nhật ký. Bảng nhỏ ở dev/staging nên thời gian dựng chỉ mục không đáng kể. TRƯỚC khi chạy production nếu bảng lớn (≥ vài trăm nghìn dòng,
-- `SELECT count(*) FROM core.action_logs`): tạo hai chỉ mục này bằng tay với CONCURRENTLY ngoài giao dịch (đúng tên, đúng
-- định nghĩa dưới đây) TRƯỚC khi migrate — IF NOT EXISTS khiến migration bỏ qua. Nếu một lần CONCURRENTLY thất bại để lại
-- chỉ mục INVALID, DROP INDEX rồi tạo lại.
--
-- Đường lùi (an toàn, chỉ mất tốc độ truy vấn, không đổi quyền/dữ liệu):
--   DROP INDEX IF EXISTS core.action_logs_ws_actor_created_idx;
--   DROP INDEX IF EXISTS core.action_logs_ws_on_behalf_created_idx;
-- (không cần lùi code; xóa dòng tương ứng ở schema/core/platform.ts nếu muốn drizzle-kit khớp).
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_logs_ws_actor_created_idx" ON "core"."action_logs" USING btree ("workspace_id","actor_id","created_at" DESC NULLS FIRST) WHERE "core"."action_logs"."actor_type" = 'user';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_logs_ws_on_behalf_created_idx" ON "core"."action_logs" USING btree ("workspace_id","on_behalf_of","created_at" DESC NULLS FIRST) WHERE "core"."action_logs"."on_behalf_of" is not null;

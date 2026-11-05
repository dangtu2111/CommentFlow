CREATE INDEX "comment_hides_stuck_idx" ON "cf"."comment_hides" USING btree ("updated_at") WHERE "cf"."comment_hides"."status" in ('queued', 'sending');--> statement-breakpoint
CREATE INDEX "comment_replies_stuck_idx" ON "cf"."comment_replies" USING btree ("updated_at") WHERE "cf"."comment_replies"."status" in ('queued', 'sending');

--> statement-breakpoint
-- ===================================================================================================
-- SEND-SWEEP + HIDE-SWEEP (feat-send-hide-sweep; ADR 008, ADR 009 §3; quyết định QSW1)
--
-- Yêu cầu gửi trả lời / ẩn bình luận có thể KẸT: `queued` (đẩy job lỗi mà bù hủy cũng lỗi) hoặc `sending` (worker chết giữa
-- lúc gọi nền tảng, hết thuê). Job quét của worker (apps/worker/src/jobs/sweep.ts) xử lý lại qua đúng job gửi/ẩn (kiểm
-- R1–R3/H1–H3, kiểm trước khi gửi lại). Worker chạy ở NGỮ CẢNH TRẦN (không workspace) nên không đọc được bảng RLS → hàm
-- DEFINER này CHỈ ĐỌC và chỉ trả id (không nội dung, không PII):
--
--   cf.list_stuck_outbox(p_kind 'reply'|'hide', p_queued_after_seconds, p_sending_after_seconds, p_limit)
--     → (workspace_id, request_id): `queued` có updated_at cũ hơn p_queued_after_seconds, hoặc `sending` cũ hơn
--       p_sending_after_seconds; cũ nhất trước; p_limit kẹp trong 1..500.
--
-- Quyền (mẫu cf.read_channel_token ở 0030): từ chối nếu có workspace/người dùng/job hệ thống (chỉ ngữ cảnh trần) hoặc
-- `session_user <> 'cf_worker'`; EXECUTE thu hồi khỏi PUBLIC và cf_app (cf_worker là thành viên cf_app: quyền EXECUTE
-- cấp cho cf_worker không chảy ngược lên cf_app), chỉ cấp cf_worker. search_path cố định có pg_temp.
-- Hai chỉ mục một phần (comment_replies_stuck_idx, comment_hides_stuck_idx) theo updated_at chỉ trên dòng đang hoạt động.
-- Ghi nhận: CREATE INDEX không CONCURRENTLY (hai bảng còn nhỏ, như 0026).
--
-- TRIỂN KHAI: migrate rồi chạy worker bản mới (job quét chạy khi khởi động và mỗi 60 giây). Worker bản cũ không gọi hàm.
-- Đường lùi: lùi worker trước; DROP FUNCTION cf.list_stuck_outbox(text, integer, integer, integer);
-- DROP INDEX cf.comment_replies_stuck_idx; DROP INDEX cf.comment_hides_stuck_idx.
-- ===================================================================================================

CREATE FUNCTION cf.list_stuck_outbox(
  p_kind text, p_queued_after_seconds integer, p_sending_after_seconds integer, p_limit integer
) RETURNS TABLE (workspace_id uuid, request_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_limit integer;
BEGIN
  -- Chỉ ngữ cảnh trần của kết nối cf_worker (fail-closed với NULL).
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR session_user <> 'cf_worker' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('reply', 'hide')
     OR p_queued_after_seconds IS NULL OR p_queued_after_seconds < 0
     OR p_sending_after_seconds IS NULL OR p_sending_after_seconds < 0
     OR p_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  v_limit := LEAST(GREATEST(p_limit, 1), 500);

  IF p_kind = 'reply' THEN
    RETURN QUERY
      SELECT r.workspace_id, r.id
        FROM cf.comment_replies r
       WHERE (r.status = 'queued' AND r.updated_at < now() - make_interval(secs => p_queued_after_seconds))
          OR (r.status = 'sending' AND r.updated_at < now() - make_interval(secs => p_sending_after_seconds))
       ORDER BY r.updated_at, r.id
       LIMIT v_limit;
  ELSE
    RETURN QUERY
      SELECT h.workspace_id, h.id
        FROM cf.comment_hides h
       WHERE (h.status = 'queued' AND h.updated_at < now() - make_interval(secs => p_queued_after_seconds))
          OR (h.status = 'sending' AND h.updated_at < now() - make_interval(secs => p_sending_after_seconds))
       ORDER BY h.updated_at, h.id
       LIMIT v_limit;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_stuck_outbox(text, integer, integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.list_stuck_outbox(text, integer, integer, integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_stuck_outbox(text, integer, integer, integer) TO cf_worker;

-- ===================================================================================================
-- PIPE-ORCHESTRATOR lát E — job quét bình luận chờ xử lý AI (Q-POR1, Q-POR7). CHỈ THÊM một hàm (không đổi bảng, không nới RLS).
--
-- Worker quét ở NGỮ CẢNH TRẦN (không workspace) nên không đọc được bảng RLS → hàm DEFINER này CHỈ ĐỌC và chỉ trả id + nguồn
-- (không nội dung, không PII), theo mẫu cf.list_stuck_outbox (0031):
--
--   cf.list_pending_pipeline_comments(p_new_after_seconds, p_processing_after_seconds, p_workspace_ids, p_limit)
--     → (workspace_id, comment_id, ingest_source, has_turn)
--   - `new` quá p_new_after_seconds (không phải của Page, chưa xóa, chưa gộp) mà: nguồn ≠ backfill VÀ workspace nằm trong
--     p_workspace_ids, HOẶC đã có dòng pipeline_turns (đã từng xử lý / nhân viên đã bấm "Soạn gợi ý" nên mới kẹt);
--   - `processing` mà khóa lượt `processing` hết thuê và cũ hơn p_processing_after_seconds (job chết/crash);
--   - BỎ QUA workspace đang dừng khẩn cấp (emergency_stopped_at) — bình luận giữ `new`, không xếp lại vô hạn (Q-POR7);
--   - bình luận nhập ngược (backfill) CHƯA từng có lượt KHÔNG BAO GIỜ được trả (FR-011);
--   - cũ nhất trước; p_limit kẹp 1..500. Quyết định cuối "có tự chạy không" vẫn do shouldAutoRunPipeline (TS) — hàm này chỉ thu hẹp.
--
-- Quyền như 0031: chỉ ngữ cảnh trần của kết nối cf_worker; EXECUTE thu hồi khỏi PUBLIC và cf_app, chỉ cấp cf_worker.
-- Đường lùi: DROP FUNCTION cf.list_pending_pipeline_comments(integer, integer, uuid[], integer); (worker bản cũ không gọi hàm).
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION cf.list_pending_pipeline_comments(
  p_new_after_seconds integer, p_processing_after_seconds integer, p_workspace_ids uuid[], p_limit integer
) RETURNS TABLE (workspace_id uuid, comment_id uuid, ingest_source text, has_turn boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_limit integer;
BEGIN
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR session_user <> 'cf_worker' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_new_after_seconds IS NULL OR p_new_after_seconds < 0
     OR p_processing_after_seconds IS NULL OR p_processing_after_seconds < 0
     OR p_workspace_ids IS NULL OR p_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  v_limit := LEAST(GREATEST(p_limit, 1), 500);

  RETURN QUERY
    SELECT c.workspace_id, c.id, c.ingest_source, (t.comment_id IS NOT NULL)
      FROM cf.comments c
      JOIN core.workspaces w ON w.id = c.workspace_id
      LEFT JOIN cf.pipeline_turns t ON t.comment_id = c.id
     WHERE w.emergency_stopped_at IS NULL
       AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
       AND (
         (c.status = 'new'
            AND coalesce(c.created_time, c.created_at) < now() - make_interval(secs => p_new_after_seconds)
            AND ((c.ingest_source <> 'backfill' AND c.workspace_id = ANY (p_workspace_ids)) OR t.comment_id IS NOT NULL))
         OR (c.status = 'processing' AND t.state = 'processing'
            AND (t.locked_until IS NULL OR t.locked_until < now())
            AND t.updated_at < now() - make_interval(secs => p_processing_after_seconds))
       )
     ORDER BY coalesce(c.created_time, c.created_at), c.id
     LIMIT v_limit;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_pending_pipeline_comments(integer, integer, uuid[], integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.list_pending_pipeline_comments(integer, integer, uuid[], integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_pending_pipeline_comments(integer, integer, uuid[], integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

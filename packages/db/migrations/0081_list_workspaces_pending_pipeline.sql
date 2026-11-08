-- ===================================================================================================
-- PIPE-FLAG-V2 (chủ dự án chốt 08/11) — cờ `cf.pipeline.v2` theo workspace thay `PIPELINE_ENABLED`/`PIPELINE_WORKSPACE_IDS`. CHỈ THÊM một hàm chỉ-đọc.
--
-- Job quét trước đây nhận danh sách workspace từ env. Nay "workspace nào bật pipeline" là CỜ DB theo workspace (override/rollout), mà override bị RLS theo workspace nên
-- không liệt kê xuyên workspace được. Cách làm: hàm DEFINER này chỉ trả các workspace ĐANG có bình luận `new` quá hạn cần quét (ít, theo chỉ mục một phần
-- `comments_pipeline_pending_idx`, 0075); worker lọc từng workspace bằng cờ rồi mới gọi `cf.list_pending_pipeline_comments` (0074/0075) với danh sách đã lọc.
--   cf.list_workspaces_with_pending_pipeline_comments(p_new_after_seconds, p_limit) → (workspace_id)
--   - cùng điều kiện nhánh A của 0075: `new`, KHÔNG backfill, không phải của Page, chưa xóa/gộp, workspace không dừng khẩn cấp, quá hạn;
--   - CHỈ id workspace (không nội dung, không PII); p_limit kẹp 1..500.
-- Quyền như 0031/0074: chỉ ngữ cảnh trần của kết nối cf_worker; EXECUTE thu hồi khỏi PUBLIC và cf_app, chỉ cấp cf_worker.
-- Đường lùi: DROP FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer); (worker bản cũ không gọi hàm).
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION cf.list_workspaces_with_pending_pipeline_comments(p_new_after_seconds integer, p_limit integer)
RETURNS TABLE (workspace_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR session_user <> 'cf_worker' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_new_after_seconds IS NULL OR p_new_after_seconds < 0 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT DISTINCT c.workspace_id
      FROM cf.comments c
      JOIN core.workspaces w ON w.id = c.workspace_id
     WHERE c.status = 'new' AND c.ingest_source <> 'backfill'
       AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
       AND w.emergency_stopped_at IS NULL
       AND coalesce(c.created_time, c.created_at) < now() - make_interval(secs => p_new_after_seconds)
     LIMIT LEAST(GREATEST(p_limit, 1), 500);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

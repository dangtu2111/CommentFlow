-- ===================================================================================================
-- PIPE-FLAG-V2 (sửa 0081, theo kiểm chéo của chủ dự án 08/11) — hàm liệt kê workspace phải bao CẢ HAI nhánh của hàm quét gốc và dùng CHUNG điều kiện.
--
-- Lỗi của 0081: `list_workspaces_with_pending_pipeline_comments` chỉ nhìn bình luận `new` → workspace chỉ còn bình luận `processing` kẹt (job chết) hoặc bình luận đã có lượt
-- (`pipeline_turns`, nhân viên bấm "Soạn gợi ý") sẽ không bao giờ được quét lại → mất bình luận. Viết lại điều kiện lần thứ hai cũng sai chỗ: hai bản dễ lệch nhau.
-- Cách sửa: MỘT hàm nội bộ `cf.pipeline_pending_rows` chứa ĐÚNG điều kiện của 0074/0075 (nhánh A `new` quá hạn không backfill của workspace trong danh sách, nhánh B từ `pipeline_turns`),
-- không LIMIT, kèm mốc thời gian `ts`; cả hai hàm DEFINER cùng đọc từ đó:
--   * `cf.list_pending_pipeline_comments` (0074/0075, cùng chữ ký, cùng kết quả) → thân hàm chỉ còn gọi hàm nội bộ + ORDER BY ts + LIMIT;
--   * `cf.list_workspaces_with_pending_pipeline_comments(p_new_after_seconds, p_processing_after_seconds, p_limit)` thay bản 2 tham số của 0081 → gom theo workspace,
--     ORDER BY bình luận chờ CŨ NHẤT trước khi LIMIT (workspace chờ lâu nhất đứng đầu, không bị bỏ đói).
-- Hàm nội bộ KHÔNG có EXECUTE cho PUBLIC/cf_app/cf_worker (chỉ hai hàm DEFINER của chủ sở hữu gọi). Nhánh A của hàm nội bộ: `p_workspace_ids` NULL = mọi workspace (chỉ hàm liệt kê workspace dùng).
-- Đường lùi: chạy lại thân hàm của 0075 cho `list_pending_pipeline_comments`; DROP FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer, integer);
--   DROP FUNCTION cf.pipeline_pending_rows(integer, integer, uuid[]).
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION cf.pipeline_pending_rows(
  p_new_after_seconds integer, p_processing_after_seconds integer, p_workspace_ids uuid[]
) RETURNS TABLE (workspace_id uuid, comment_id uuid, ingest_source text, has_turn boolean, ts timestamptz)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
  -- A: bình luận `new` quá hạn, không backfill, workspace trong danh sách (NULL = mọi workspace) — dùng chỉ mục một phần.
  SELECT c.workspace_id, c.id AS comment_id, c.ingest_source, (t.comment_id IS NOT NULL) AS has_turn,
         coalesce(c.created_time, c.created_at) AS ts
    FROM cf.comments c
    JOIN core.workspaces w ON w.id = c.workspace_id
    LEFT JOIN cf.pipeline_turns t ON t.comment_id = c.id
   WHERE c.status = 'new' AND c.ingest_source <> 'backfill'
     AND (p_workspace_ids IS NULL OR c.workspace_id = ANY (p_workspace_ids))
     AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
     AND w.emergency_stopped_at IS NULL
     AND coalesce(c.created_time, c.created_at) < now() - make_interval(secs => p_new_after_seconds)
  UNION
  -- B: đi từ `pipeline_turns` (nhỏ): `new` đã có lượt (kể cả backfill nhân viên bấm) hoặc `processing` hết thuê.
  SELECT c.workspace_id, c.id, c.ingest_source, true, coalesce(c.created_time, c.created_at)
    FROM cf.pipeline_turns t
    JOIN cf.comments c ON c.id = t.comment_id
    JOIN core.workspaces w ON w.id = c.workspace_id
   WHERE w.emergency_stopped_at IS NULL
     AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
     AND (
       (c.status = 'new' AND coalesce(c.created_time, c.created_at) < now() - make_interval(secs => p_new_after_seconds))
       OR (c.status = 'processing' AND t.state = 'processing'
           AND (t.locked_until IS NULL OR t.locked_until < now())
           AND t.updated_at < now() - make_interval(secs => p_processing_after_seconds))
     );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.pipeline_pending_rows(integer, integer, uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.pipeline_pending_rows(integer, integer, uuid[]) FROM cf_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cf.list_pending_pipeline_comments(
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
    SELECT q.workspace_id, q.comment_id, q.ingest_source, q.has_turn
      FROM cf.pipeline_pending_rows(p_new_after_seconds, p_processing_after_seconds, p_workspace_ids) q
     ORDER BY q.ts, q.comment_id
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
DROP FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer);
--> statement-breakpoint
CREATE FUNCTION cf.list_workspaces_with_pending_pipeline_comments(
  p_new_after_seconds integer, p_processing_after_seconds integer, p_limit integer
) RETURNS TABLE (workspace_id uuid)
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
  IF p_new_after_seconds IS NULL OR p_new_after_seconds < 0
     OR p_processing_after_seconds IS NULL OR p_processing_after_seconds < 0
     OR p_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  -- Workspace có bình luận chờ CŨ NHẤT đứng đầu (không bị bỏ đói); chỉ id workspace, không nội dung/PII.
  RETURN QUERY
    SELECT q.workspace_id
      FROM cf.pipeline_pending_rows(p_new_after_seconds, p_processing_after_seconds, NULL) q
     GROUP BY q.workspace_id
     ORDER BY min(q.ts), q.workspace_id
     LIMIT LEAST(GREATEST(p_limit, 1), 500);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer, integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_workspaces_with_pending_pipeline_comments(integer, integer, integer) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

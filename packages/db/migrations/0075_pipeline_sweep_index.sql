-- ===================================================================================================
-- PIPE-ORCHESTRATOR — chỉ mục một phần cho job quét + viết lại thân hàm quét theo hai nhánh (chủ dự án duyệt 07/11, theo #254).
--
-- Bài toán: job quét chạy mỗi 5 phút ở ngữ cảnh trần. Bảng bình luận có thể chứa hàng chục nghìn bình luận backfill (nhập ngược,
-- không bao giờ tự chạy) — truy vấn không được quét toàn bảng.
--   * CHỈ MỤC `comments_pipeline_pending_idx` trên (coalesce(created_time, created_at), id), CHỈ gồm bình luận còn chờ
--     (status new/processing), KHÔNG backfill, chưa xóa/gộp, không phải của Page — nhỏ và rộng theo hàng chờ, không theo lịch sử.
--   * HÀM `cf.list_pending_pipeline_comments` (0074) viết lại bằng CREATE OR REPLACE (cùng chữ ký, cùng quyền, cùng kết quả) thành HAI
--     nhánh UNION: A = bình luận `new` quá hạn của workspace trong danh sách (dùng chỉ mục một phần); B = đi từ `pipeline_turns` (bảng
--     nhỏ: chỉ bình luận đã/đang xử lý, kể cả backfill do nhân viên bấm) nối vào bình luận theo khóa chính. Bình luận backfill chưa có lượt
--     vẫn KHÔNG BAO GIỜ được trả. Ngữ nghĩa giữ nguyên (bỏ qua workspace dừng khẩn cấp, thuê hết hạn, lọc Page/xóa/gộp).
-- Chỉ THÊM chỉ mục + thay thân một hàm chỉ-đọc; không đổi bảng, không nới RLS/quyền (CREATE OR REPLACE giữ ACL; REVOKE/GRANT lặp lại cho chắc).
-- Ghi nhận: CREATE INDEX không CONCURRENTLY (như 0026/0031; bảng bình luận còn nhỏ ở giai đoạn này).
-- Đường lùi: DROP INDEX cf.comments_pipeline_pending_idx; rồi chạy lại thân hàm của 0074.
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "comments_pipeline_pending_idx" ON "cf"."comments" USING btree ((coalesce("created_time", "created_at")), "id")
  WHERE "status" IN ('new', 'processing') AND "ingest_source" <> 'backfill' AND "deleted_at" IS NULL AND "merged_into_id" IS NULL AND "is_own" = false;
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
      FROM (
        -- A: bình luận `new` quá hạn, không backfill, workspace trong danh sách (chỉ mục một phần).
        SELECT c.workspace_id, c.id AS comment_id, c.ingest_source, (t.comment_id IS NOT NULL) AS has_turn,
               coalesce(c.created_time, c.created_at) AS ts
          FROM cf.comments c
          JOIN core.workspaces w ON w.id = c.workspace_id
          LEFT JOIN cf.pipeline_turns t ON t.comment_id = c.id
         WHERE c.status = 'new' AND c.ingest_source <> 'backfill'
           AND c.workspace_id = ANY (p_workspace_ids)
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
           )
      ) q
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
SET LOCAL lock_timeout = DEFAULT;

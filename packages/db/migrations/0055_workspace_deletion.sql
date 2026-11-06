SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "core"."workspace_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'awaiting_confirm' NOT NULL,
	"confirm_expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"execute_after" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"completed_at" timestamp with time zone,
	"deleted_members" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_deletion_requests_status_check" CHECK ("core"."workspace_deletion_requests"."status" in ('awaiting_confirm', 'scheduled', 'cancelled', 'expired', 'completed')),
	CONSTRAINT "workspace_deletion_requests_state_check" CHECK (("core"."workspace_deletion_requests"."status" <> 'scheduled' or ("core"."workspace_deletion_requests"."confirmed_at" is not null and "core"."workspace_deletion_requests"."execute_after" is not null))
        and ("core"."workspace_deletion_requests"."status" <> 'completed' or "core"."workspace_deletion_requests"."completed_at" is not null)
        and ("core"."workspace_deletion_requests"."status" <> 'cancelled' or "core"."workspace_deletion_requests"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_deletion_requests_open_unique" ON "core"."workspace_deletion_requests" USING btree ("workspace_id") WHERE "core"."workspace_deletion_requests"."status" in ('awaiting_confirm', 'scheduled');--> statement-breakpoint
CREATE INDEX "workspace_deletion_requests_due_idx" ON "core"."workspace_deletion_requests" USING btree ("execute_after") WHERE "core"."workspace_deletion_requests"."status" = 'scheduled';--> statement-breakpoint

-- ===================================================================================================
-- WORKSPACE-DELETE (FR-094, US-071, DB-MAINTENANCE-ROLE phần xóa workspace, Q-WSD1) — feat-workspace-delete.
-- Xóa workspace vĩnh viễn, nhiều bước, chỉ Owner, có thời gian chờ.
--
--  * core.workspace_deletion_requests: KHÔNG có khóa ngoại tới core.workspaces (cố ý): xóa workspace không kéo theo dòng
--    này — nó là NHẬT KÝ TỐI THIỂU còn lại sau khi xóa (id workspace, người yêu cầu/hủy, mốc thời gian, số thành viên;
--    KHÔNG tên/slug/nội dung). cf_app CHỈ ĐỌC; một policy SELECT: Owner của workspace hoặc ngữ cảnh hệ thống. Không
--    policy/GRANT ghi. Chỉ một yêu cầu "đang mở" (awaiting_confirm/scheduled) cho mỗi workspace (chỉ mục duy nhất một phần).
--  * Bước 1 core.request_workspace_deletion(p_workspace_id): Owner (withActor) tạo yêu cầu `awaiting_confirm`, hết hạn
--    sau 15 phút (DELETION_CONFIRM_WINDOW_MINUTES). Đã có yêu cầu chờ còn hạn → trả lại chính nó (idempotent); đã `scheduled`
--    → CF409. Yêu cầu chờ quá hạn bị đánh `expired` rồi tạo mới.
--  * Bước 2 core.confirm_workspace_deletion(p_workspace_id, p_request_id, p_typed_slug): CHÍNH người đã làm bước 1, gõ lại
--    ĐÚNG slug workspace → `scheduled`, execute_after = now() + 7 ngày (DELETION_GRACE_DAYS). Kết quả trả bằng mã
--    (ok/expired/mismatch/not_requester) để không bị rollback; request id của workspace khác → CF404 (không lộ tồn tại).
--  * core.cancel_workspace_deletion(p_workspace_id): BẤT KỲ Owner nào hủy yêu cầu đang mở (hết thời gian chờ chưa chạy xóa).
--    Cả ba hàm: SECURITY DEFINER, người dùng lấy từ core.current_user_id() (KHÔNG nhận user id), đòi workspace ngữ cảnh =
--    tham số, không phải đường hệ thống, và core.is_workspace_owner(); sai → 42501. EXECUTE chỉ cf_app. Ghi action_logs
--    (workspace.deletion_requested / .scheduled / .cancelled; actor = Owner).
--  * core.list_due_workspace_deletions(p_limit): CHỈ ĐỌC, chỉ NGỮ CẢNH TRẦN + cf_worker (mẫu cf.list_stuck_outbox);
--    trả (workspace_id, request_id) của yêu cầu `scheduled` đã tới hạn, tối đa 50.
--  * core.execute_workspace_deletion(p_workspace_id, p_request_id): chỉ job HỆ THỐNG cf_worker (withJob, mẫu 0054).
--    Khóa dòng yêu cầu, kiểm lại `scheduled` + tới hạn + đúng workspace (hủy giữa chừng/chưa tới hạn → không xóa), rồi
--    ĐỒNG THỜI trong một giao dịch: đánh `completed` (+ số thành viên) và DELETE core.workspaces (mọi bảng nghiệp vụ có
--    FK ON DELETE CASCADE tới workspaces nên dữ liệu đi theo; trigger guard_last_owner đã cho phép xóa cascade). Trả
--    'deleted' | 'not_due' | 'not_scheduled'.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi gọi nào trong runtime web. Job worker chỉ chạy khi WORKSPACE_DELETE_ENABLED=true
-- (mặc định TẮT). Đường lùi: DROP FUNCTION core.execute_workspace_deletion(uuid, uuid),
-- core.list_due_workspace_deletions(integer), core.cancel_workspace_deletion(uuid),
-- core.confirm_workspace_deletion(uuid, uuid, text), core.request_workspace_deletion(uuid);
-- DROP TABLE core.workspace_deletion_requests; lùi check-rls.ts. Workspace ĐÃ XÓA không phục hồi được (có chủ đích).
-- ===================================================================================================
ALTER TABLE core.workspace_deletion_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON core.workspace_deletion_requests TO cf_app;
--> statement-breakpoint
CREATE POLICY workspace_deletion_requests_select ON core.workspace_deletion_requests FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_owner()))
  );
--> statement-breakpoint

CREATE FUNCTION core.request_workspace_deletion(p_workspace_id uuid)
RETURNS TABLE (request_id uuid, confirm_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_open core.workspace_deletion_requests%ROWTYPE;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id
     OR core.is_system_context() IS NOT FALSE
     OR NOT core.is_workspace_owner() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('core.workspace_deletion:' || p_workspace_id::text, 0));

  UPDATE core.workspace_deletion_requests r SET status = 'expired'
   WHERE r.workspace_id = p_workspace_id AND r.status = 'awaiting_confirm' AND r.confirm_expires_at <= now();

  SELECT * INTO v_open FROM core.workspace_deletion_requests r
   WHERE r.workspace_id = p_workspace_id AND r.status IN ('awaiting_confirm', 'scheduled');
  IF FOUND THEN
    IF v_open.status = 'scheduled' THEN
      RAISE EXCEPTION 'already_scheduled' USING ERRCODE = 'CF409';
    END IF;
    request_id := v_open.id;
    confirm_expires_at := v_open.confirm_expires_at;
    RETURN NEXT;
    RETURN;
  END IF;

  v_expires := now() + interval '15 minutes';
  INSERT INTO core.workspace_deletion_requests (workspace_id, requested_by, confirm_expires_at)
  VALUES (p_workspace_id, v_user, v_expires)
  RETURNING id INTO v_id;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (p_workspace_id, 'user', v_user, 'workspace.deletion_requested', 'workspace', p_workspace_id::text,
          jsonb_build_object('request_id', v_id, 'confirm_expires_at', v_expires));

  request_id := v_id;
  confirm_expires_at := v_expires;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.request_workspace_deletion(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.request_workspace_deletion(uuid) TO cf_app;
--> statement-breakpoint

CREATE FUNCTION core.confirm_workspace_deletion(p_workspace_id uuid, p_request_id uuid, p_typed_slug text)
RETURNS TABLE (result text, execute_after timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_req core.workspace_deletion_requests%ROWTYPE;
  v_slug text;
  v_after timestamptz;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL OR p_request_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id
     OR core.is_system_context() IS NOT FALSE
     OR NOT core.is_workspace_owner() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('core.workspace_deletion:' || p_workspace_id::text, 0));

  SELECT * INTO v_req FROM core.workspace_deletion_requests r
   WHERE r.id = p_request_id AND r.workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'CF404';
  END IF;
  IF v_req.status <> 'awaiting_confirm' THEN
    RAISE EXCEPTION 'not_awaiting' USING ERRCODE = 'CF409';
  END IF;
  IF v_req.confirm_expires_at <= now() THEN
    UPDATE core.workspace_deletion_requests r SET status = 'expired' WHERE r.id = v_req.id;
    result := 'expired';
    execute_after := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_req.requested_by <> v_user THEN
    result := 'not_requester';
    execute_after := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT w.slug INTO v_slug FROM core.workspaces w WHERE w.id = p_workspace_id;
  IF v_slug IS NULL OR p_typed_slug IS NULL OR btrim(p_typed_slug) = ''
     OR btrim(p_typed_slug) IS DISTINCT FROM v_slug THEN
    result := 'mismatch';
    execute_after := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_after := now() + make_interval(days => 7);
  UPDATE core.workspace_deletion_requests r
     SET status = 'scheduled', confirmed_at = now(), execute_after = v_after
   WHERE r.id = v_req.id;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (p_workspace_id, 'user', v_user, 'workspace.deletion_scheduled', 'workspace', p_workspace_id::text,
          jsonb_build_object('request_id', v_req.id, 'execute_after', v_after));

  result := 'ok';
  execute_after := v_after;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.confirm_workspace_deletion(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.confirm_workspace_deletion(uuid, uuid, text) TO cf_app;
--> statement-breakpoint

CREATE FUNCTION core.cancel_workspace_deletion(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_id uuid;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id
     OR core.is_system_context() IS NOT FALSE
     OR NOT core.is_workspace_owner() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('core.workspace_deletion:' || p_workspace_id::text, 0));

  UPDATE core.workspace_deletion_requests r
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user
   WHERE r.workspace_id = p_workspace_id AND r.status IN ('awaiting_confirm', 'scheduled')
  RETURNING r.id INTO v_id;
  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (p_workspace_id, 'user', v_user, 'workspace.deletion_cancelled', 'workspace', p_workspace_id::text,
          jsonb_build_object('request_id', v_id));
  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.cancel_workspace_deletion(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.cancel_workspace_deletion(uuid) TO cf_app;
--> statement-breakpoint

CREATE FUNCTION core.list_due_workspace_deletions(p_limit integer)
RETURNS TABLE (workspace_id uuid, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
BEGIN
  IF session_user <> 'cf_worker'
     OR core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT r.workspace_id, r.id
      FROM core.workspace_deletion_requests r
     WHERE r.status = 'scheduled' AND r.execute_after <= now()
     ORDER BY r.execute_after
     LIMIT least(greatest(coalesce(p_limit, 1), 1), 50);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.list_due_workspace_deletions(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.list_due_workspace_deletions(integer) TO cf_worker;
--> statement-breakpoint

CREATE FUNCTION core.execute_workspace_deletion(p_workspace_id uuid, p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_req core.workspace_deletion_requests%ROWTYPE;
  v_members integer;
BEGIN
  IF session_user <> 'cf_worker'
     OR core.is_system_context() IS NOT TRUE
     OR core.current_user_id() IS NOT NULL
     OR p_workspace_id IS NULL OR p_request_id IS NULL
     OR core.current_workspace_id() IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('core.workspace_deletion:' || p_workspace_id::text, 0));

  SELECT * INTO v_req FROM core.workspace_deletion_requests r
   WHERE r.id = p_request_id AND r.workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'scheduled' THEN
    RETURN 'not_scheduled';
  END IF;
  IF v_req.execute_after IS NULL OR v_req.execute_after > now() THEN
    RETURN 'not_due';
  END IF;

  -- Workspace đã biến mất bằng đường khác: không ghi `completed` sai sự thật; đóng yêu cầu để job không lặp mãi.
  IF NOT EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = p_workspace_id) THEN
    UPDATE core.workspace_deletion_requests r
       SET status = 'cancelled', cancelled_at = now() WHERE r.id = v_req.id;
    RETURN 'not_scheduled';
  END IF;

  SELECT count(*)::integer INTO v_members FROM core.members m WHERE m.workspace_id = p_workspace_id;

  UPDATE core.workspace_deletion_requests r
     SET status = 'completed', completed_at = now(), deleted_members = v_members
   WHERE r.id = v_req.id;

  DELETE FROM core.workspaces w WHERE w.id = p_workspace_id;
  RETURN 'deleted';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.execute_workspace_deletion(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.execute_workspace_deletion(uuid, uuid) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

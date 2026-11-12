-- POST-PUBLISHING (Biên tập bài viết + Lịch đăng): bài viết do Owner soạn để lưu nháp / lên lịch / đăng lên Fanpage Facebook (Q-PUB1).
-- Hành động HƯỚNG RA NGOÀI nên thiết kế theo: (1) tối đa MỘT lần — mục tiêu được thuê (`publishing`) trước khi gọi nền tảng; kết quả không rõ → `unknown`,
-- KHÔNG bao giờ tự thử lại; (2) chỉ Owner tạo/sửa/đăng; (3) workspace đang Dừng khẩn cấp thì worker không nhận việc; (4) ghi `action_logs` (không kèm nội dung bài).
-- Thiết kế quyền:
--   * cf.publish_posts / cf.publish_post_targets: cf_app chỉ ĐỌC (SELECT) và chỉ Owner của workspace (hoặc ngữ cảnh hệ thống) thấy dòng; KHÔNG có INSERT/UPDATE/DELETE trực tiếp.
--   * Ghi qua hàm SECURITY DEFINER (search_path cố định, REVOKE PUBLIC, GRANT cf_app):
--       save_publish_post / cancel_publish_schedule / delete_publish_post / publish_post_now = CHỈ Owner đang hoạt động (withActor);
--       claim_publish_targets / record_publish_result                                      = CHỈ hệ thống (worker withJob);
--       list_due_publish_workspaces                                                        = CHỈ ngữ cảnh trần của cf_worker (withSystem), như 0081.
--   * Trạng thái bài: draft → scheduled → publishing → published | partial | failed. Mục tiêu: pending → publishing → published | failed | unknown (| pending khi `retry`).
-- Đường lùi: DROP FUNCTION cf.save_publish_post(uuid, text, uuid[], timestamptz), cf.cancel_publish_schedule(uuid), cf.delete_publish_post(uuid), cf.publish_post_now(uuid),
--   cf.claim_publish_targets(integer), cf.record_publish_result(uuid, text, text, text), cf.list_due_publish_workspaces(integer), cf.recompute_publish_post(uuid);
--   DROP TABLE cf.publish_post_targets, cf.publish_posts (MẤT nháp/lịch; bài đã đăng trên Facebook không bị ảnh hưởng).
CREATE TABLE "cf"."publish_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_posts_status_check" CHECK ("cf"."publish_posts"."status" IN ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed')),
	CONSTRAINT "publish_posts_message_len_check" CHECK (char_length("cf"."publish_posts"."message") <= 63206),
	CONSTRAINT "publish_posts_scheduled_check" CHECK ("cf"."publish_posts"."status" NOT IN ('scheduled', 'publishing') OR ("cf"."publish_posts"."scheduled_at" IS NOT NULL AND btrim("cf"."publish_posts"."message") <> ''))
);
--> statement-breakpoint
CREATE TABLE "cf"."publish_post_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"external_post_id" text,
	"error_code" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_post_targets_unique" UNIQUE("post_id", "channel_id"),
	CONSTRAINT "publish_post_targets_status_check" CHECK ("cf"."publish_post_targets"."status" IN ('pending', 'publishing', 'published', 'failed', 'unknown')),
	CONSTRAINT "publish_post_targets_error_check" CHECK ("cf"."publish_post_targets"."error_code" IS NULL OR "cf"."publish_post_targets"."error_code" ~ '^[a-z0-9_:]{1,60}$'),
	CONSTRAINT "publish_post_targets_external_check" CHECK ("cf"."publish_post_targets"."external_post_id" IS NULL OR "cf"."publish_post_targets"."external_post_id" ~ '^[A-Za-z0-9_.-]{1,100}$')
);
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_targets" ADD CONSTRAINT "publish_post_targets_post_fk" FOREIGN KEY ("post_id") REFERENCES "cf"."publish_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_targets" ADD CONSTRAINT "publish_post_targets_channel_fk" FOREIGN KEY ("channel_id") REFERENCES "cf"."channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_posts" ADD CONSTRAINT "publish_posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_targets" ADD CONSTRAINT "publish_post_targets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "publish_posts_workspace_scheduled_idx" ON "cf"."publish_posts" ("workspace_id", "scheduled_at");
--> statement-breakpoint
CREATE INDEX "publish_posts_due_idx" ON "cf"."publish_posts" ("scheduled_at") WHERE "status" IN ('scheduled', 'publishing');
--> statement-breakpoint
CREATE INDEX "publish_post_targets_post_idx" ON "cf"."publish_post_targets" ("post_id");
--> statement-breakpoint
ALTER TABLE cf.publish_posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.publish_post_targets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.publish_posts TO cf_app;
--> statement-breakpoint
GRANT SELECT ON cf.publish_post_targets TO cf_app;
--> statement-breakpoint
CREATE POLICY publish_posts_select ON cf.publish_posts FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY publish_post_targets_select ON cf.publish_post_targets FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint

-- Tính lại trạng thái bài từ các mục tiêu (nội bộ: KHÔNG cấp cho cf_app). Gọi sau khi mục tiêu đổi trạng thái.
CREATE FUNCTION cf.recompute_publish_post(p_post_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_pending integer;
  v_busy integer;
  v_published integer;
  v_total integer;
BEGIN
  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'publishing'),
         count(*) FILTER (WHERE status = 'published'),
         count(*)
    INTO v_pending, v_busy, v_published, v_total
    FROM cf.publish_post_targets WHERE post_id = p_post_id;
  IF v_total = 0 THEN
    RETURN;
  END IF;
  IF v_busy > 0 THEN
    UPDATE cf.publish_posts SET status = 'publishing', updated_at = now() WHERE id = p_post_id AND status IN ('scheduled', 'publishing');
  ELSIF v_pending > 0 THEN
    UPDATE cf.publish_posts SET status = 'scheduled', updated_at = now() WHERE id = p_post_id AND status IN ('scheduled', 'publishing');
  ELSIF v_published = v_total THEN
    UPDATE cf.publish_posts SET status = 'published', published_at = now(), updated_at = now() WHERE id = p_post_id AND status IN ('scheduled', 'publishing');
  ELSIF v_published > 0 THEN
    UPDATE cf.publish_posts SET status = 'partial', updated_at = now() WHERE id = p_post_id AND status IN ('scheduled', 'publishing');
  ELSE
    UPDATE cf.publish_posts SET status = 'failed', updated_at = now() WHERE id = p_post_id AND status IN ('scheduled', 'publishing');
  END IF;
END
$$;
--> statement-breakpoint

-- Lưu bài (tạo mới hoặc sửa) — CHỈ Owner. `p_scheduled_at` NULL → nháp; có giờ → đã lên lịch (cách hiện tại ≥ 2 phút, ≤ 90 ngày; cần nội dung và ≥ 1 kênh).
-- Chỉ sửa được bài `draft`/`scheduled`. Kênh phải là Facebook `connected` của workspace.
CREATE FUNCTION cf.save_publish_post(p_id uuid, p_message text, p_channel_ids uuid[], p_scheduled_at timestamptz) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_message text := coalesce(p_message, '');
  v_channels uuid[];
  v_id uuid := p_id;
  v_status text;
  v_new boolean := false;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_message) > 63206 THEN
    RAISE EXCEPTION 'message too long' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT c), '{}'::uuid[]) INTO v_channels FROM unnest(coalesce(p_channel_ids, '{}'::uuid[])) AS c;
  IF cardinality(v_channels) > 10 THEN
    RAISE EXCEPTION 'too many channels' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_channels) > 0 AND (
       SELECT count(*) FROM cf.channels ch
        WHERE ch.id = ANY (v_channels) AND ch.workspace_id = v_ws AND ch.platform = 'facebook' AND ch.status = 'connected'
     ) <> cardinality(v_channels) THEN
    RAISE EXCEPTION 'invalid channel' USING ERRCODE = '22023';
  END IF;
  IF p_scheduled_at IS NOT NULL THEN
    IF btrim(v_message) = '' OR cardinality(v_channels) = 0 THEN
      RAISE EXCEPTION 'schedule needs content and channel' USING ERRCODE = '22023';
    END IF;
    IF p_scheduled_at < now() + interval '2 minutes' OR p_scheduled_at > now() + interval '90 days' THEN
      RAISE EXCEPTION 'invalid schedule' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_status := CASE WHEN p_scheduled_at IS NULL THEN 'draft' ELSE 'scheduled' END;

  IF v_id IS NULL THEN
    INSERT INTO cf.publish_posts (workspace_id, message, status, scheduled_at, created_by)
    VALUES (v_ws, v_message, v_status, p_scheduled_at, core.current_user_id())
    RETURNING id INTO v_id;
    v_new := true;
  ELSE
    UPDATE cf.publish_posts
       SET message = v_message, status = v_status, scheduled_at = p_scheduled_at, updated_at = now()
     WHERE id = v_id AND workspace_id = v_ws AND status IN ('draft', 'scheduled')
       AND NOT EXISTS (SELECT 1 FROM cf.publish_post_targets t WHERE t.post_id = v_id AND t.status <> 'pending');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'post not editable' USING ERRCODE = '55000';
    END IF;
    DELETE FROM cf.publish_post_targets WHERE post_id = v_id AND workspace_id = v_ws;
  END IF;

  INSERT INTO cf.publish_post_targets (workspace_id, post_id, channel_id)
  SELECT v_ws, v_id, c FROM unnest(v_channels) AS c;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (v_ws, 'user', core.current_user_id(), CASE WHEN v_new THEN 'publish_post.created' ELSE 'publish_post.updated' END,
          'publish_post', v_id::text, jsonb_build_object('status', v_status, 'channels', cardinality(v_channels)));
  RETURN v_id;
END
$$;
--> statement-breakpoint

-- Hủy lịch: `scheduled` → `draft`. Trả false nếu không còn `scheduled` (đã đăng/đang đăng/đã đổi).
CREATE FUNCTION cf.cancel_publish_schedule(p_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE cf.publish_posts SET status = 'draft', scheduled_at = NULL, updated_at = now()
   WHERE id = p_id AND workspace_id = v_ws AND status = 'scheduled'
     AND NOT EXISTS (SELECT 1 FROM cf.publish_post_targets t WHERE t.post_id = p_id AND t.status <> 'pending');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
    VALUES (v_ws, 'user', core.current_user_id(), 'publish_post.schedule_cancelled', 'publish_post', p_id::text);
  END IF;
  RETURN v_rows = 1;
END
$$;
--> statement-breakpoint

-- Xóa bài `draft`/`failed`/`partial` (không xóa bài đang chờ/đang đăng/đã đăng thành công). Trả false nếu không xóa được.
CREATE FUNCTION cf.delete_publish_post(p_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM cf.publish_posts WHERE id = p_id AND workspace_id = v_ws AND status IN ('draft', 'failed', 'partial');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
    VALUES (v_ws, 'user', core.current_user_id(), 'publish_post.deleted', 'publish_post', p_id::text);
  END IF;
  RETURN v_rows = 1;
END
$$;
--> statement-breakpoint

-- Đăng ngay: `draft`/`scheduled` → `scheduled` với giờ = bây giờ (worker nhận ở lần quét kế tiếp). Cần nội dung, ≥ 1 kênh, các kênh vẫn Facebook `connected`.
CREATE FUNCTION cf.publish_post_now(p_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cf.publish_post_targets t WHERE t.post_id = p_id AND t.workspace_id = v_ws) THEN
    RAISE EXCEPTION 'schedule needs content and channel' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cf.publish_post_targets t
      LEFT JOIN cf.channels ch ON ch.id = t.channel_id AND ch.workspace_id = v_ws AND ch.platform = 'facebook' AND ch.status = 'connected'
     WHERE t.post_id = p_id AND t.workspace_id = v_ws AND ch.id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid channel' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.publish_posts SET status = 'scheduled', scheduled_at = now(), updated_at = now()
   WHERE id = p_id AND workspace_id = v_ws AND status IN ('draft', 'scheduled') AND btrim(message) <> '';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
    VALUES (v_ws, 'user', core.current_user_id(), 'publish_post.publish_now', 'publish_post', p_id::text);
  END IF;
  RETURN v_rows = 1;
END
$$;
--> statement-breakpoint

-- WORKER: workspace có bài đến hạn (không đang Dừng khẩn cấp). Chỉ ngữ cảnh TRẦN của cf_worker (như 0081).
CREATE FUNCTION cf.list_due_publish_workspaces(p_limit integer)
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
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT DISTINCT p.workspace_id
      FROM cf.publish_posts p
      JOIN core.workspaces w ON w.id = p.workspace_id
     WHERE p.status IN ('scheduled', 'publishing') AND p.scheduled_at <= now()
       AND w.emergency_stopped_at IS NULL
     LIMIT p_limit;
END
$$;
--> statement-breakpoint

-- WORKER (withJob): (1) thuê hết hạn (`publishing` quá 15 phút) → `unknown` (KHÔNG tự đăng lại); (2) nhận tối đa p_limit mục tiêu `pending` của bài đến hạn:
-- `FOR UPDATE SKIP LOCKED` nên hai worker không nhận trùng; đặt `publishing` + tăng `attempts` + ghi `claimed_at` TRONG cùng giao dịch trước khi gọi nền tảng.
CREATE FUNCTION cf.claim_publish_targets(p_limit integer)
RETURNS TABLE (target_id uuid, post_id uuid, channel_id uuid, channel_external_id text, message text, scopes text[], attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_stale uuid[];
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM core.workspaces w WHERE w.id = v_ws AND w.emergency_stopped_at IS NOT NULL) THEN
    RETURN;
  END IF;

  WITH expired AS (
    UPDATE cf.publish_post_targets t
       SET status = 'unknown', error_code = 'lease_expired', updated_at = now()
     WHERE t.workspace_id = v_ws AND t.status = 'publishing' AND t.claimed_at < now() - interval '15 minutes'
    RETURNING t.post_id
  )
  SELECT coalesce(array_agg(DISTINCT e.post_id), '{}'::uuid[]) INTO v_stale FROM expired e;
  IF cardinality(v_stale) > 0 THEN
    PERFORM cf.recompute_publish_post(s) FROM unnest(v_stale) AS s;
  END IF;

  RETURN QUERY
    WITH picked AS (
      SELECT t.id
        FROM cf.publish_post_targets t
        JOIN cf.publish_posts p ON p.id = t.post_id
        JOIN cf.channels ch ON ch.id = t.channel_id AND ch.workspace_id = t.workspace_id
       WHERE t.workspace_id = v_ws AND t.status = 'pending' AND t.attempts < 3
         AND p.status IN ('scheduled', 'publishing') AND p.scheduled_at <= now()
         AND ch.platform = 'facebook' AND ch.status = 'connected'
       ORDER BY p.scheduled_at, t.id
       LIMIT p_limit
       FOR UPDATE OF t SKIP LOCKED
    ), claimed AS (
      UPDATE cf.publish_post_targets t
         SET status = 'publishing', attempts = t.attempts + 1, claimed_at = now(), updated_at = now()
        FROM picked
       WHERE t.id = picked.id
      RETURNING t.id, t.post_id, t.channel_id, t.attempts
    ), touched AS (
      UPDATE cf.publish_posts p SET status = 'publishing', updated_at = now()
       WHERE p.id IN (SELECT c.post_id FROM claimed c) AND p.status = 'scheduled'
      RETURNING p.id
    )
    SELECT c.id, c.post_id, c.channel_id, ch.external_id, p.message, ch.scopes, c.attempts
      FROM claimed c
      JOIN cf.publish_posts p ON p.id = c.post_id
      JOIN cf.channels ch ON ch.id = c.channel_id;
END
$$;
--> statement-breakpoint

-- WORKER (withJob): ghi kết quả của MỘT mục tiêu đang `publishing`. outcome ∈ published | failed | unknown | retry. Chỉ ghi khi còn `publishing` (không ghi đè, không ghi hai lần).
CREATE FUNCTION cf.record_publish_result(p_target_id uuid, p_outcome text, p_external_id text, p_error text) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_post uuid;
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('published', 'failed', 'unknown', 'retry') THEN
    RAISE EXCEPTION 'invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'published' AND p_external_id IS NULL THEN
    RAISE EXCEPTION 'published needs external id' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.publish_post_targets t
     SET status = CASE p_outcome WHEN 'retry' THEN 'pending' ELSE p_outcome END,
         external_post_id = CASE WHEN p_outcome = 'published' THEN p_external_id ELSE t.external_post_id END,
         error_code = CASE WHEN p_outcome = 'published' THEN NULL ELSE p_error END,
         published_at = CASE WHEN p_outcome = 'published' THEN now() ELSE t.published_at END,
         claimed_at = CASE WHEN p_outcome = 'retry' THEN NULL ELSE t.claimed_at END,
         updated_at = now()
   WHERE t.id = p_target_id AND t.workspace_id = v_ws AND t.status = 'publishing'
  RETURNING t.post_id INTO v_post;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN false;
  END IF;
  PERFORM cf.recompute_publish_post(v_post);
  IF p_outcome <> 'retry' THEN
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
    VALUES (v_ws, 'system', NULL, 'publish_post.' || p_outcome, 'publish_post', v_post::text,
            jsonb_build_object('target', p_target_id, 'error', p_error));
  END IF;
  RETURN true;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.recompute_publish_post(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.save_publish_post(uuid, text, uuid[], timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.cancel_publish_schedule(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.delete_publish_post(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.publish_post_now(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_due_publish_workspaces(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.claim_publish_targets(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.record_publish_result(uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.save_publish_post(uuid, text, uuid[], timestamptz) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.cancel_publish_schedule(uuid) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.delete_publish_post(uuid) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.publish_post_now(uuid) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.claim_publish_targets(integer) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.record_publish_result(uuid, text, text, text) TO cf_app;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.list_due_publish_workspaces(integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_due_publish_workspaces(integer) TO cf_worker;

-- COMPOSER-MEDIA (Q-PUB4): ảnh/video đính kèm bài đăng. File nằm ở kho S3 (SeaweedFS), khóa `workspace_id/asset_id`; DB chỉ giữ siêu dữ liệu + liên kết với bài.
-- Giới hạn một bài: tối đa 10 ảnh (≤ 8MB) HOẶC đúng 1 video (≤ 200MB), không trộn (kiểm lại ở DB). Loại file do web kiểm bằng NỘI DUNG trước khi ghi.
-- Quyền: cf_app chỉ SELECT (Owner/hệ thống thấy); ghi qua hàm DEFINER: register_media_asset / set_publish_post_media = CHỈ Owner (withActor);
--   list_publish_media = CHỈ hệ thống (worker withJob); purge_orphan_media = CHỈ ngữ cảnh trần của cf_worker (withSystem), dọn file mồ côi.
-- Chỉ THÊM bảng và hàm; không đổi bảng/hàm hiện có.
-- Đường lùi: DROP FUNCTION cf.purge_orphan_media(integer), cf.list_publish_media(uuid), cf.set_publish_post_media(uuid, uuid[]), cf.register_media_asset(uuid, text, text, bigint);
--   DROP TABLE cf.publish_post_media, cf.media_assets (mất liên kết ảnh/video của bài chưa đăng; file trong kho S3 cần xóa tay; bài đã đăng trên Facebook không bị ảnh hưởng).
CREATE TABLE "cf"."media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_workspace_id_unique" UNIQUE("workspace_id", "id"),
	CONSTRAINT "media_assets_kind_check" CHECK ("kind" IN ('image', 'video')),
	CONSTRAINT "media_assets_type_check" CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime')),
	CONSTRAINT "media_assets_size_check" CHECK ("size_bytes" > 0 AND (("kind" = 'image' AND "size_bytes" <= 8388608) OR ("kind" = 'video' AND "size_bytes" <= 209715200)))
);
--> statement-breakpoint
CREATE TABLE "cf"."publish_post_media" (
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "publish_post_media_pk" PRIMARY KEY("post_id", "media_id"),
	CONSTRAINT "publish_post_media_position_check" CHECK ("position" BETWEEN 0 AND 9),
	CONSTRAINT "publish_post_media_media_unique" UNIQUE("media_id")
);
--> statement-breakpoint
ALTER TABLE "cf"."media_assets" ADD CONSTRAINT "media_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_media" ADD CONSTRAINT "publish_post_media_post_fk" FOREIGN KEY ("post_id") REFERENCES "cf"."publish_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_media" ADD CONSTRAINT "publish_post_media_media_fk" FOREIGN KEY ("workspace_id", "media_id") REFERENCES "cf"."media_assets"("workspace_id", "id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_media" ADD CONSTRAINT "publish_post_media_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "media_assets_workspace_created_idx" ON "cf"."media_assets" ("workspace_id", "created_at");
--> statement-breakpoint
ALTER TABLE cf.media_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.publish_post_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.media_assets TO cf_app;
--> statement-breakpoint
GRANT SELECT ON cf.publish_post_media TO cf_app;
--> statement-breakpoint
CREATE POLICY media_assets_select ON cf.media_assets FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY publish_post_media_select ON cf.publish_post_media FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint

-- Owner đăng ký MỘT file đã nằm trong kho (id do web tạo; khóa kho = workspace_id/id). Chặn spam: tối đa 60 file chưa gắn vào bài.
CREATE FUNCTION cf.register_media_asset(p_id uuid, p_kind text, p_content_type text, p_size bigint) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM cf.media_assets a
       WHERE a.workspace_id = v_ws
         AND NOT EXISTS (SELECT 1 FROM cf.publish_post_media m WHERE m.media_id = a.id)) >= 60 THEN
    RAISE EXCEPTION 'too many unattached media' USING ERRCODE = '53400';
  END IF;
  INSERT INTO cf.media_assets (id, workspace_id, kind, content_type, size_bytes, created_by)
  VALUES (p_id, v_ws, p_kind, p_content_type, p_size, core.current_user_id());
END
$$;
--> statement-breakpoint

-- Owner đặt danh sách file của một bài NHÁP/ĐÃ LÊN LỊCH (thay toàn bộ, giữ thứ tự). File phải thuộc workspace và chưa gắn bài khác. Tối đa 10 ảnh HOẶC 1 video.
CREATE FUNCTION cf.set_publish_post_media(p_post_id uuid, p_media_ids uuid[]) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_ids uuid[];
  v_images integer;
  v_videos integer;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(x.p ORDER BY x.o), '{}'::uuid[]) INTO v_ids
    FROM (SELECT u.p, min(u.o) AS o FROM unnest(coalesce(p_media_ids, '{}'::uuid[])) WITH ORDINALITY AS u(p, o) GROUP BY u.p) x;
  IF NOT EXISTS (SELECT 1 FROM cf.publish_posts WHERE id = p_post_id AND workspace_id = v_ws AND status IN ('draft', 'scheduled')) THEN
    RAISE EXCEPTION 'post not editable' USING ERRCODE = '55000';
  END IF;
  IF cardinality(v_ids) > 0 THEN
    IF (SELECT count(*) FROM cf.media_assets a
         WHERE a.id = ANY (v_ids) AND a.workspace_id = v_ws
           AND NOT EXISTS (SELECT 1 FROM cf.publish_post_media m WHERE m.media_id = a.id AND m.post_id <> p_post_id)) <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'invalid media' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) FILTER (WHERE kind = 'image'), count(*) FILTER (WHERE kind = 'video') INTO v_images, v_videos
      FROM cf.media_assets WHERE id = ANY (v_ids) AND workspace_id = v_ws;
    IF (v_images > 0 AND v_videos > 0) OR v_images > 10 OR v_videos > 1 THEN
      RAISE EXCEPTION 'invalid media set' USING ERRCODE = '22023';
    END IF;
  END IF;
  DELETE FROM cf.publish_post_media WHERE post_id = p_post_id AND workspace_id = v_ws;
  INSERT INTO cf.publish_post_media (workspace_id, post_id, media_id, position)
  SELECT v_ws, p_post_id, x.p, (x.o - 1)::smallint FROM unnest(v_ids) WITH ORDINALITY AS x(p, o);
END
$$;
--> statement-breakpoint

-- WORKER (withJob): file của một bài, theo thứ tự, để tải từ kho và đăng.
CREATE FUNCTION cf.list_publish_media(p_post_id uuid)
RETURNS TABLE (media_id uuid, kind text, content_type text, size_bytes bigint, "position" smallint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.id, a.kind, a.content_type, a.size_bytes, m.position
      FROM cf.publish_post_media m
      JOIN cf.media_assets a ON a.workspace_id = m.workspace_id AND a.id = m.media_id
     WHERE m.workspace_id = v_ws AND m.post_id = p_post_id
     ORDER BY m.position;
END
$$;
--> statement-breakpoint

-- WORKER (ngữ cảnh trần của cf_worker): xóa dòng file MỒ CÔI rồi trả (workspace_id, id) để worker xóa file trong kho.
-- Mồ côi = chưa gắn bài nào quá 24 giờ, hoặc chỉ gắn bài đã kết thúc (published/failed/partial) quá 7 ngày.
CREATE FUNCTION cf.purge_orphan_media(p_limit integer)
RETURNS TABLE (workspace_id uuid, id uuid)
LANGUAGE plpgsql
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
    DELETE FROM cf.media_assets a
     WHERE a.id IN (
       SELECT x.id FROM cf.media_assets x
        WHERE (NOT EXISTS (SELECT 1 FROM cf.publish_post_media m WHERE m.media_id = x.id) AND x.created_at < now() - interval '24 hours')
           OR EXISTS (SELECT 1 FROM cf.publish_post_media m JOIN cf.publish_posts p ON p.id = m.post_id
                       WHERE m.media_id = x.id AND p.status IN ('published', 'failed', 'partial') AND p.updated_at < now() - interval '7 days')
        ORDER BY x.created_at LIMIT p_limit
     )
    RETURNING a.workspace_id, a.id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.register_media_asset(uuid, text, text, bigint) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_publish_post_media(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_publish_media(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.purge_orphan_media(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.register_media_asset(uuid, text, text, bigint) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_publish_post_media(uuid, uuid[]) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_publish_media(uuid) TO cf_app;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.purge_orphan_media(integer) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.purge_orphan_media(integer) TO cf_worker;

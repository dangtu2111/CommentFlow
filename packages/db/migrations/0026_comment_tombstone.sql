CREATE TABLE "cf"."comment_tombstones" (
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_tombstones_pk" PRIMARY KEY("channel_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "cf"."comment_tombstones" ADD CONSTRAINT "comment_tombstones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_tombstones" ADD CONSTRAINT "comment_tombstones_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_events_retention_idx" ON "cf"."webhook_events" USING btree ("created_at") WHERE "cf"."webhook_events"."payload" <> '{}'::jsonb;

--> statement-breakpoint
-- ===================================================================================================
-- COMMENT-DELETE-BEFORE-CREATE + WEBHOOK-PAYLOAD-RETENTION (feat/comment-tombstone, FR-048, quyết định chủ dự án 05/11/2026)
--
-- 1) Dấu xóa: sự kiện "khách xóa" đến TRƯỚC sự kiện "tạo" → cf.mark_comment_deleted ghi cf.comment_tombstones (kênh, mã bình
--    luận, giờ xóa; KHÔNG nội dung). Trigger BEFORE INSERT cf.apply_comment_tombstone trên cf.comments (SECURITY DEFINER, bao
--    mọi đường chèn) thấy dấu xóa → lưu dòng NGAY ở dạng đã xóa trắng (deleted_at = giờ dấu xóa, redacted_at, text '',
--    text_normalized/author_name NULL, author_external_id '', attachments []). Bảng chỉ chủ bảng/hàm DEFINER chạm vào:
--    cf_app KHÔNG có quyền trực tiếp; RLS bật + policy chỉ hệ thống (phòng khi sau này cấp quyền nhầm).
-- 2) cf.purge_expired_webhook_payloads(p_days): payload sự kiện cũ hơn p_days (job worker: 14 ngày) → '{}' (dòng received/
--    processing/failed quá hạn → dead, error 'expired'); xóa dấu xóa cũ hơn p_days. Chỉ NGỮ CẢNH TRẦN (không workspace/người
--    dùng/job hệ thống), như cf.record_webhook_event. Chỉ mục webhook_events_retention_idx (một phần: payload <> '{}').
--
-- Ghi nhận (đã chấp nhận): CREATE INDEX webhook_events_retention_idx không CONCURRENTLY (bảng còn nhỏ trước khi chạy thật);
-- purge là một UPDATE (bảng nhỏ; tách lô khi lớn — gap WEBHOOK-PAYLOAD-RETENTION-BATCH); dấu xóa giữ 14 ngày (= payload).
--
-- TRIỂN KHAI: migrate rồi chạy worker bản mới (job dọn chạy khi khởi động và mỗi giờ).
-- Đường lùi: lùi code trước; DROP TRIGGER comments_apply_tombstone ON cf.comments; DROP FUNCTION cf.apply_comment_tombstone();
-- DROP FUNCTION cf.purge_expired_webhook_payloads(integer); CREATE OR REPLACE cf.mark_comment_deleted bằng bản 0025;
-- DROP TABLE cf.comment_tombstones; DROP INDEX cf.webhook_events_retention_idx.
-- ===================================================================================================

ALTER TABLE cf.comment_tombstones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON cf.comment_tombstones FROM cf_app;
--> statement-breakpoint
CREATE POLICY comment_tombstones_system ON cf.comment_tombstones FOR ALL TO cf_app
  USING (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_system_context()))
  WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_system_context()));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.mark_comment_deleted(p_channel_id uuid, p_external_id text, p_deleted_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_id uuid;
  v_channel_external text;
  v_platform text;
  v_deleted_at timestamptz := COALESCE(p_deleted_at, now());
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- Kênh phải thuộc workspace của job (không ghi dấu xóa/xóa trắng chéo workspace).
  SELECT ch.external_id, ch.platform INTO v_channel_external, v_platform
    FROM cf.channels ch WHERE ch.id = p_channel_id AND ch.workspace_id = v_ws;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Tuần tự hóa với trigger chèn (cùng khóa): xóa và tạo cùng lúc không thể mỗi bên "không thấy" bên kia (READ COMMITTED).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_channel_id::text || ':' || p_external_id, 0));

  UPDATE cf.comments
     SET deleted_at = v_deleted_at,
         redacted_at = now(),
         text = '',
         text_normalized = NULL,
         author_name = NULL,
         author_external_id = '',
         attachments = '[]'::jsonb
   WHERE workspace_id = v_ws AND channel_id = p_channel_id AND external_id = p_external_id AND deleted_at IS NULL
  RETURNING id INTO v_id;

  -- Chưa có dòng nào (sự kiện xóa đến trước sự kiện tạo): ghi dấu xóa; giờ của lần ĐẦU được giữ.
  IF v_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM cf.comments
     WHERE workspace_id = v_ws AND channel_id = p_channel_id AND external_id = p_external_id
  ) THEN
    INSERT INTO cf.comment_tombstones (workspace_id, channel_id, external_id, deleted_at)
    VALUES (v_ws, p_channel_id, p_external_id, v_deleted_at)
    ON CONFLICT (channel_id, external_id) DO NOTHING;
  END IF;

  -- Bản sao nội dung trong sự kiện tạo/sửa của CHÍNH bình luận này (chạy vô điều kiện, kể cả khi sự kiện đến trước/muộn):
  -- xóa payload; dòng chưa xử lý/đang lỗi → dead để worker không tạo lại nội dung. Sự kiện xóa giữ nguyên.
  UPDATE cf.webhook_events
     SET payload = '{}'::jsonb,
         status = CASE WHEN status IN ('received', 'processing', 'failed') THEN 'dead' ELSE status END,
         error = CASE WHEN status IN ('received', 'processing', 'failed') THEN 'redacted' ELSE error END
   WHERE workspace_id = v_ws
     AND platform = v_platform
     AND payload->>'channelExternalId' = v_channel_external
     AND payload->'comment'->>'externalId' = p_external_id;
  RETURN v_id;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.apply_comment_tombstone() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_deleted_at timestamptz;
  v_channel_external text;
  v_platform text;
BEGIN
  -- Cùng khóa với cf.mark_comment_deleted: bên đến sau luôn thấy dữ liệu ĐÃ COMMIT của bên kia.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.channel_id::text || ':' || NEW.external_id, 0));
  SELECT t.deleted_at INTO v_deleted_at
    FROM cf.comment_tombstones t
   WHERE t.channel_id = NEW.channel_id AND t.external_id = NEW.external_id AND t.workspace_id = NEW.workspace_id;
  IF FOUND THEN
    NEW.deleted_at := v_deleted_at;
    NEW.redacted_at := now();
    NEW.text := '';
    NEW.text_normalized := NULL;
    NEW.author_name := NULL;
    NEW.author_external_id := '';
    NEW.attachments := '[]'::jsonb;
    -- Sự kiện tạo/sửa đến SAU dấu xóa còn giữ payload có nội dung: xóa ngay (không chờ job 14 ngày).
    SELECT ch.external_id, ch.platform INTO v_channel_external, v_platform
      FROM cf.channels ch WHERE ch.id = NEW.channel_id AND ch.workspace_id = NEW.workspace_id;
    UPDATE cf.webhook_events
       SET payload = '{}'::jsonb
     WHERE workspace_id = NEW.workspace_id
       AND platform = v_platform
       AND payload->>'channelExternalId' = v_channel_external
       AND payload->'comment'->>'externalId' = NEW.external_id
       AND payload <> '{}'::jsonb;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.apply_comment_tombstone() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER comments_apply_tombstone BEFORE INSERT ON cf.comments
  FOR EACH ROW EXECUTE FUNCTION cf.apply_comment_tombstone();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.purge_expired_webhook_payloads(p_days integer)
RETURNS TABLE (payloads integer, tombstones integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_payloads integer;
  v_tombstones integer;
BEGIN
  -- Chỉ ngữ cảnh trần: không workspace, không người dùng, không phải job hệ thống (fail-closed với NULL).
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  -- Cận dưới 7 ngày: gọi nhầm (lỗi lập trình) không thể xóa dữ liệu còn cần để thử lại.
  IF p_days IS NULL OR p_days < 7 THEN
    RAISE EXCEPTION 'invalid_days' USING ERRCODE = 'CF422';
  END IF;

  UPDATE cf.webhook_events
     SET payload = '{}'::jsonb,
         status = CASE WHEN status IN ('received', 'processing', 'failed') THEN 'dead' ELSE status END,
         error = CASE WHEN status IN ('received', 'processing', 'failed') THEN 'expired' ELSE error END
   WHERE created_at < now() - make_interval(days => p_days)
     AND payload <> '{}'::jsonb;
  GET DIAGNOSTICS v_payloads = ROW_COUNT;

  DELETE FROM cf.comment_tombstones WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_tombstones = ROW_COUNT;

  RETURN QUERY SELECT v_payloads, v_tombstones;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.purge_expired_webhook_payloads(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.purge_expired_webhook_payloads(integer) TO cf_app;

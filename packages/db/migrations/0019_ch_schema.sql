CREATE TABLE "cf"."channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"access_token_enc" "bytea",
	"key_version" integer DEFAULT 1 NOT NULL,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"webhook_subscribed" boolean DEFAULT false NOT NULL,
	"reply_language" text DEFAULT 'auto' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_polled_at" timestamp with time zone,
	"send_suspended_until" timestamp with time zone,
	"send_suspended_reason" text,
	"rate_limit_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_platform_external_workspace_unique" UNIQUE("platform","external_id","workspace_id"),
	CONSTRAINT "channels_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "channels_platform_check" CHECK ("cf"."channels"."platform" in ('facebook', 'instagram', 'tiktok')),
	CONSTRAINT "channels_status_check" CHECK ("cf"."channels"."status" in ('connected', 'expired', 'revoked', 'error')),
	CONSTRAINT "channels_reply_language_check" CHECK ("cf"."channels"."reply_language" in ('auto', 'vi', 'en'))
);
--> statement-breakpoint
CREATE TABLE "cf"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"parent_external_id" text,
	"author_external_id" text NOT NULL,
	"author_name" text,
	"text" text NOT NULL,
	"text_normalized" text,
	"lang" text,
	"created_time" timestamp with time zone,
	"label" text,
	"label_confidence" numeric(4, 3),
	"label_source" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"needs_followup" boolean DEFAULT false NOT NULL,
	"followup_topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"merged_into_id" uuid,
	"is_impersonation_suspected" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_own" boolean DEFAULT false NOT NULL,
	"locked_by" uuid,
	"locked_until" timestamp with time zone,
	"external_reply_id" text,
	"replied_by" uuid,
	"replied_at" timestamp with time zone,
	"private_replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_channel_external_unique" UNIQUE("channel_id","external_id"),
	CONSTRAINT "comments_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "comments_label_confidence_check" CHECK ("cf"."comments"."label_confidence" is null or ("cf"."comments"."label_confidence" >= 0 and "cf"."comments"."label_confidence" <= 1)),
	CONSTRAINT "comments_status_check" CHECK ("cf"."comments"."status" in ('new', 'processing', 'pending_review', 'needs_human', 'scheduled_auto', 'sending', 'replied', 'auto_replied', 'send_failed', 'skipped', 'spam_suspected', 'hidden')),
	CONSTRAINT "comments_label_source_check" CHECK ("cf"."comments"."label_source" is null or "cf"."comments"."label_source" in ('rule', 'ml', 'llm', 'human'))
);
--> statement-breakpoint
CREATE TABLE "cf"."posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"message" text,
	"permalink" text,
	"media_url" text,
	"is_ad" boolean DEFAULT false NOT NULL,
	"created_time" timestamp with time zone,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_channel_external_unique" UNIQUE("channel_id","external_id"),
	CONSTRAINT "posts_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "posts_workspace_channel_id_unique" UNIQUE("workspace_id","channel_id","id")
);
--> statement-breakpoint
CREATE TABLE "cf"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"platform" text NOT NULL,
	"event_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_hash_workspace_unique" UNIQUE NULLS NOT DISTINCT("event_hash","workspace_id"),
	CONSTRAINT "webhook_events_platform_check" CHECK ("cf"."webhook_events"."platform" in ('facebook', 'instagram', 'tiktok')),
	CONSTRAINT "webhook_events_status_check" CHECK ("cf"."webhook_events"."status" in ('received', 'processing', 'done', 'failed', 'dead'))
);
--> statement-breakpoint
ALTER TABLE "cf"."channels" ADD CONSTRAINT "channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_replied_by_users_id_fk" FOREIGN KEY ("replied_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_post_fk" FOREIGN KEY ("workspace_id","channel_id","post_id") REFERENCES "cf"."posts"("workspace_id","channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_merged_into_fk" FOREIGN KEY ("workspace_id","merged_into_id") REFERENCES "cf"."comments"("workspace_id","id") ON DELETE SET NULL ("merged_into_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."posts" ADD CONSTRAINT "posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."posts" ADD CONSTRAINT "posts_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."webhook_events" ADD CONSTRAINT "webhook_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_workspace_status_created_idx" ON "cf"."comments" USING btree ("workspace_id","status","created_time");--> statement-breakpoint
CREATE INDEX "comments_post_id_idx" ON "cf"."comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "comments_merged_into_idx" ON "cf"."comments" USING btree ("workspace_id","merged_into_id") WHERE "cf"."comments"."merged_into_id" is not null;--> statement-breakpoint
CREATE INDEX "webhook_events_workspace_status_idx" ON "cf"."webhook_events" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "cf"."webhook_events" USING btree ("status","created_at") WHERE "cf"."webhook_events"."status" in ('received', 'failed');

-- ===================================================================================================
-- Phần viết tay (feat/ch-schema, CH-SCHEMA): RLS, quyền bảng/cột, trigger. Mẫu ADR 005 §3 + ADR 007.
--  * Đường người dùng (withActor: có app.user_id) và đường HỆ THỐNG (withJob: app.ctx = 'system', không người dùng →
--    core.is_system_context()). `withWorkspace()` trần KHÔNG phải hệ thống: quên withActor ở route web thì bị TỪ CHỐI
--    ghi (fail-closed), không được nâng quyền.
--  * SELECT channels/posts/comments: hệ thống/withWorkspace trần HOẶC thành viên đang hoạt động (người gọi không phải thành
--    viên → 0 dòng, phòng sai id/IDOR). webhook_events: chỉ Owner đang hoạt động hoặc hệ thống đọc (payload có PII).
--  * channels: KHÔNG có INSERT cho cf_app (tạo kênh kèm token qua hàm DEFINER ở TOKEN-ENC sau khi xác minh token với Meta);
--    UPDATE: Owner hoặc hệ thống, nhưng trigger chỉ cho đường người dùng đổi `name`, `reply_language`.
--  * posts: INSERT/UPDATE chỉ hệ thống. comments: INSERT chỉ hệ thống; UPDATE thành viên đang hoạt động hoặc hệ thống,
--    trigger cấm đường người dùng sửa dữ liệu nền tảng (text, author, attachments, is_own...) và giả replied_by/locked_by.
--  * webhook_events: chỉ hệ thống ghi. KHÔNG bảng nào có DELETE.
--  * channels.access_token_enc, key_version: cf_app KHÔNG có quyền cột nào. send_suspended_*/rate_limit_override: chỉ ĐỌC.
--  * Cột định danh (workspace_id, channel_id, post_id, external_id, platform, event_hash, payload...) không UPDATE được.
--  * comments_merged_into_fk dùng SET NULL (merged_into_id) — chỉ đặt NULL cột con, không đụng workspace_id NOT NULL (PG15+;
--    sửa tay: drizzle-kit không biểu diễn được, snapshot vẫn ghi `set null`).
--
-- Đường lùi: DROP TABLE cf.webhook_events, cf.comments, cf.posts, cf.channels CASCADE; DROP FUNCTION cf.guard_channel_user_update(),
-- cf.guard_comment_user_update(), core.is_system_context() (bảng mới, chưa có dữ liệu thật).
-- ===================================================================================================

CREATE FUNCTION core.is_system_context() RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT current_setting('app.ctx', true) = 'system' AND core.current_user_id() IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.is_system_context() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.is_system_context() TO cf_app;
--> statement-breakpoint

ALTER TABLE cf.channels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.webhook_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===== channels (không INSERT; không đọc/ghi token) =====
GRANT SELECT (id, workspace_id, platform, external_id, name, avatar_url, token_expires_at, scopes, status,
  webhook_subscribed, reply_language, capabilities, last_polled_at, send_suspended_until, send_suspended_reason,
  rate_limit_override, created_at, updated_at) ON cf.channels TO cf_app;
--> statement-breakpoint
GRANT UPDATE (name, avatar_url, token_expires_at, scopes, status, webhook_subscribed, reply_language,
  capabilities, last_polled_at, updated_at) ON cf.channels TO cf_app;
--> statement-breakpoint
CREATE POLICY channels_select ON cf.channels FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY channels_update ON cf.channels FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE FUNCTION cf.guard_channel_user_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Ngoài hệ thống (đường người dùng): chỉ được đổi name và reply_language.
  IF NOT core.is_system_context() AND (
       NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
    OR NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
    OR NEW.scopes IS DISTINCT FROM OLD.scopes
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.webhook_subscribed IS DISTINCT FROM OLD.webhook_subscribed
    OR NEW.capabilities IS DISTINCT FROM OLD.capabilities
    OR NEW.last_polled_at IS DISTINCT FROM OLD.last_polled_at
  ) THEN
    RAISE EXCEPTION 'channels: cột do hệ thống quản lý, người dùng chỉ sửa name và reply_language'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.guard_channel_user_update() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER channels_guard_user_update
  BEFORE UPDATE ON cf.channels
  FOR EACH ROW EXECUTE FUNCTION cf.guard_channel_user_update();
--> statement-breakpoint

-- ===== posts (chỉ hệ thống ghi) =====
GRANT SELECT, INSERT ON cf.posts TO cf_app;
--> statement-breakpoint
GRANT UPDATE (message, permalink, media_url, is_ad, created_time, comment_count, pending_count, updated_at)
  ON cf.posts TO cf_app;
--> statement-breakpoint
CREATE POLICY posts_select ON cf.posts FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY posts_insert ON cf.posts FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY posts_update ON cf.posts FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint

-- ===== comments (INSERT chỉ hệ thống; UPDATE thành viên/hệ thống + trigger) =====
GRANT SELECT, INSERT ON cf.comments TO cf_app;
--> statement-breakpoint
GRANT UPDATE (author_name, text, text_normalized, lang, label, label_confidence, label_source, labels, attachments,
  needs_followup, followup_topics, merged_into_id, is_impersonation_suspected, status, is_hidden, is_own,
  locked_by, locked_until, external_reply_id, replied_by, replied_at, private_replied_at, updated_at)
  ON cf.comments TO cf_app;
--> statement-breakpoint
CREATE POLICY comments_select ON cf.comments FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY comments_insert ON cf.comments FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY comments_update ON cf.comments FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE FUNCTION cf.guard_comment_user_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF NOT core.is_system_context() THEN
    -- Đường người dùng: không sửa dữ liệu nền tảng/khách viết, cờ chống vòng lặp, nghi mạo danh.
    IF NEW.text IS DISTINCT FROM OLD.text
       OR NEW.text_normalized IS DISTINCT FROM OLD.text_normalized
       OR NEW.lang IS DISTINCT FROM OLD.lang
       OR NEW.author_name IS DISTINCT FROM OLD.author_name
       OR NEW.attachments IS DISTINCT FROM OLD.attachments
       OR NEW.is_own IS DISTINCT FROM OLD.is_own
       OR NEW.is_impersonation_suspected IS DISTINCT FROM OLD.is_impersonation_suspected
    THEN
      RAISE EXCEPTION 'comments: dữ liệu nền tảng do hệ thống quản lý, người dùng không sửa'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Không ghi tên người khác vào "ai đã trả lời"/"ai đang khóa": giá trị mới phải là NULL hoặc chính người gọi.
    IF NEW.replied_by IS DISTINCT FROM OLD.replied_by
       AND NEW.replied_by IS NOT NULL AND NEW.replied_by IS DISTINCT FROM core.current_user_id() THEN
      RAISE EXCEPTION 'comments: replied_by phải là người gọi' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.locked_by IS DISTINCT FROM OLD.locked_by
       AND NEW.locked_by IS NOT NULL AND NEW.locked_by IS DISTINCT FROM core.current_user_id() THEN
      RAISE EXCEPTION 'comments: locked_by phải là người gọi' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.guard_comment_user_update() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER comments_guard_user_update
  BEFORE UPDATE ON cf.comments
  FOR EACH ROW EXECUTE FUNCTION cf.guard_comment_user_update();
--> statement-breakpoint

-- ===== webhook_events (chỉ hệ thống ghi; Owner hoặc hệ thống đọc) =====
GRANT SELECT, INSERT ON cf.webhook_events TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status, attempts, error, processed_at) ON cf.webhook_events TO cf_app;
--> statement-breakpoint
CREATE POLICY webhook_events_select ON cf.webhook_events FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY webhook_events_insert ON cf.webhook_events FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
--> statement-breakpoint
CREATE POLICY webhook_events_update ON cf.webhook_events FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );

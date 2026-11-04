CREATE TABLE "cf"."channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"access_token_enc" text,
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
	CONSTRAINT "posts_workspace_id_id_unique" UNIQUE("workspace_id","id")
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
	CONSTRAINT "webhook_events_event_hash_unique" UNIQUE("event_hash"),
	CONSTRAINT "webhook_events_platform_check" CHECK ("cf"."webhook_events"."platform" in ('facebook', 'instagram', 'tiktok')),
	CONSTRAINT "webhook_events_status_check" CHECK ("cf"."webhook_events"."status" in ('received', 'processing', 'done', 'failed', 'dead'))
);
--> statement-breakpoint
ALTER TABLE "cf"."channels" ADD CONSTRAINT "channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_replied_by_users_id_fk" FOREIGN KEY ("replied_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_post_fk" FOREIGN KEY ("workspace_id","post_id") REFERENCES "cf"."posts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_merged_into_fk" FOREIGN KEY ("workspace_id","merged_into_id") REFERENCES "cf"."comments"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."posts" ADD CONSTRAINT "posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."posts" ADD CONSTRAINT "posts_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."webhook_events" ADD CONSTRAINT "webhook_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_workspace_status_created_idx" ON "cf"."comments" USING btree ("workspace_id","status","created_time");--> statement-breakpoint
CREATE INDEX "comments_post_id_idx" ON "cf"."comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "webhook_events_workspace_status_idx" ON "cf"."webhook_events" USING btree ("workspace_id","status");

-- ===================================================================================================
-- Phần viết tay (feat/ch-schema, CH-SCHEMA): RLS, quyền bảng/cột. Mẫu ADR 005 §3.
--  * Cùng role cf_app; phân biệt đường người dùng (withActor: có app.user_id) và đường hệ thống (job: không có
--    app.user_id → `current_user_id() IS NULL`).
--  * SELECT channels/posts/comments: hệ thống HOẶC thành viên đang hoạt động (người gọi không phải thành viên → 0 dòng,
--    phòng sai id/IDOR ở đường người dùng).
--  * channels INSERT/UPDATE: Owner đang hoạt động HOẶC hệ thống. posts/comments INSERT/UPDATE: thành viên đang hoạt động
--    HOẶC hệ thống. webhook_events: chỉ hệ thống ghi; Owner hoặc hệ thống đọc. KHÔNG bảng nào có DELETE.
--  * channels.access_token_enc: cf_app KHÔNG có quyền cột nào (tạo kênh kèm token / đọc token do hàm DEFINER của
--    TOKEN-ENC). Cột khóa gửi do Admin (send_suspended_*, rate_limit_override): cf_app chỉ ĐỌC, không UPDATE/INSERT.
--  * Cột định danh/khóa ngoại (workspace_id, channel_id, post_id, external_id...) không UPDATE được sau khi tạo.
--  * webhook_events.workspace_id NULL (chưa map kênh): không dòng nào hiện cho workspace; ghi bằng hàm DEFINER của WH-INGEST.
--
-- Đường lùi: DROP TABLE cf.webhook_events, cf.comments, cf.posts, cf.channels (bảng mới, chưa có dữ liệu thật).
-- ===================================================================================================

ALTER TABLE cf.channels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.webhook_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===== channels =====
GRANT SELECT (id, workspace_id, platform, external_id, name, avatar_url, token_expires_at, scopes, status,
  webhook_subscribed, reply_language, capabilities, last_polled_at, send_suspended_until, send_suspended_reason,
  rate_limit_override, created_at, updated_at) ON cf.channels TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, platform, external_id, name, avatar_url, token_expires_at, scopes, status,
  webhook_subscribed, reply_language, capabilities, last_polled_at) ON cf.channels TO cf_app;
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
CREATE POLICY channels_insert ON cf.channels FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint
CREATE POLICY channels_update ON cf.channels FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.current_user_id()) IS NULL)
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint

-- ===== posts =====
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
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint
CREATE POLICY posts_update ON cf.posts FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.current_user_id()) IS NULL)
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint

-- ===== comments =====
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
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint
CREATE POLICY comments_update ON cf.comments FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.current_user_id()) IS NULL)
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_member()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint

-- ===== webhook_events =====
GRANT SELECT, INSERT ON cf.webhook_events TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status, attempts, error, processed_at) ON cf.webhook_events TO cf_app;
--> statement-breakpoint
CREATE POLICY webhook_events_select ON cf.webhook_events FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.current_user_id()) IS NULL)
  );
--> statement-breakpoint
CREATE POLICY webhook_events_insert ON cf.webhook_events FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.current_user_id()) IS NULL
  );
--> statement-breakpoint
CREATE POLICY webhook_events_update ON cf.webhook_events FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.current_user_id()) IS NULL
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.current_user_id()) IS NULL
  );

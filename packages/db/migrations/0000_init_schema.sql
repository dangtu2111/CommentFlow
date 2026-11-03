CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "cf";
--> statement-breakpoint
CREATE TABLE "core"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"is_admin_session" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'vi' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"admin_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_locale_check" CHECK ("core"."users"."locale" in ('vi', 'en')),
	CONSTRAINT "users_admin_role_check" CHECK ("core"."users"."admin_role" is null or "core"."users"."admin_role" in ('super', 'support', 'finance')),
	CONSTRAINT "users_admin_consistency_check" CHECK ("core"."users"."is_admin" or "core"."users"."admin_role" is null)
);
--> statement-breakpoint
CREATE TABLE "core"."verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"impersonation_id" uuid,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_logs_actor_type_check" CHECK ("core"."action_logs"."actor_type" in ('user', 'ai', 'system', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "core"."feature_flag_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_key" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_overrides_flag_workspace_unique" UNIQUE("flag_key","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "core"."feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"product" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"default_on" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 0 NOT NULL,
	"plans" text[],
	"owner" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_product_check" CHECK ("core"."feature_flags"."product" in ('core', 'commentflow', 'excelflow')),
	CONSTRAINT "feature_flags_kind_check" CHECK ("core"."feature_flags"."kind" in ('release', 'ops', 'kill_switch', 'plan')),
	CONSTRAINT "feature_flags_rollout_check" CHECK ("core"."feature_flags"."rollout_percent" between 0 and 100),
	CONSTRAINT "feature_flags_release_expiry_check" CHECK ("core"."feature_flags"."kind" <> 'release' or "core"."feature_flags"."expires_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "core"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_role_check" CHECK ("core"."invitations"."role" in ('owner', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "core"."members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"invited_by" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_workspace_user_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "members_role_check" CHECK ("core"."members"."role" in ('owner', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "core"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"default_lang" text DEFAULT 'vi' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"emergency_stopped_at" timestamp with time zone,
	"ai_cost_cap_usd" numeric(12, 2),
	"status" text DEFAULT 'trial' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_default_lang_check" CHECK ("core"."workspaces"."default_lang" in ('vi', 'en')),
	CONSTRAINT "workspaces_status_check" CHECK ("core"."workspaces"."status" in ('trial', 'active', 'past_due', 'suspended', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "cf"."ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"draft_id" uuid,
	"step" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."action_logs" ADD CONSTRAINT "action_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_key_feature_flags_key_fk" FOREIGN KEY ("flag_key") REFERENCES "core"."feature_flags"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."members" ADD CONSTRAINT "members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."members" ADD CONSTRAINT "members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."ai_usage" ADD CONSTRAINT "ai_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "core"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "core"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "core"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "core"."verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "action_logs_workspace_created_idx" ON "core"."action_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "invitations_workspace_id_idx" ON "core"."invitations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "members_user_id_idx" ON "core"."members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_workspace_created_idx" ON "cf"."ai_usage" USING btree ("workspace_id","created_at");
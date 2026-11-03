CREATE TABLE "core"."two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "two_factors_user_id_idx" ON "core"."two_factors" USING btree ("user_id");
--> statement-breakpoint
-- Bảng của plugin 2FA (ADR 004 §4): chứa secret TOTP và mã dự phòng đã mã hóa. Chỉ role cf_auth, và chỉ trong
-- app.ctx = 'auth' (cần cả role lẫn ngữ cảnh). cf_app KHÔNG có quyền nào (kể cả đọc dòng của chính mình).
-- Đường lùi: DROP TABLE core.two_factors.
ALTER TABLE core.two_factors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY two_factors_auth_access ON core.two_factors FOR ALL TO cf_auth
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON core.two_factors TO cf_auth;

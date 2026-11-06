SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."automation_rules" (
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"target" text NOT NULL,
	"label" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rules_pk" PRIMARY KEY("workspace_id","channel_id","target","label"),
	CONSTRAINT "automation_rules_target_check" CHECK ("cf"."automation_rules"."target" IN ('comment', 'message')),
	CONSTRAINT "automation_rules_label_check" CHECK ("cf"."automation_rules"."label" IN ('price', 'advice', 'purchase')),
	CONSTRAINT "automation_rules_mode_check" CHECK ("cf"."automation_rules"."mode" IN ('off', 'shadow', 'auto'))
);
--> statement-breakpoint
CREATE TABLE "cf"."automation_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"threshold" double precision DEFAULT 0.85 NOT NULL,
	"delay_seconds" integer DEFAULT 60 NOT NULL,
	"daily_cap" integer DEFAULT 50 NOT NULL,
	"active_hours" jsonb,
	"blocked_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"signature" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_settings_threshold_check" CHECK ("cf"."automation_settings"."threshold" >= 0.8 AND "cf"."automation_settings"."threshold" <= 1),
	CONSTRAINT "automation_settings_delay_check" CHECK ("cf"."automation_settings"."delay_seconds" IN (0, 60, 120, 300)),
	CONSTRAINT "automation_settings_daily_cap_check" CHECK ("cf"."automation_settings"."daily_cap" BETWEEN 1 AND 1000),
	CONSTRAINT "automation_settings_active_hours_check" CHECK ("cf"."automation_settings"."active_hours" IS NULL OR jsonb_typeof("cf"."automation_settings"."active_hours") = 'object'),
	CONSTRAINT "automation_settings_keywords_check" CHECK (cardinality("cf"."automation_settings"."blocked_keywords") <= 50),
	CONSTRAINT "automation_settings_signature_check" CHECK ("cf"."automation_settings"."signature" IS NULL OR char_length("cf"."automation_settings"."signature") BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "cf"."automation_rules" ADD CONSTRAINT "automation_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."automation_rules" ADD CONSTRAINT "automation_rules_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD CONSTRAINT "automation_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."automation_settings" ADD CONSTRAINT "automation_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ===================================================================================================
-- AUTO-CONFIG-STORE (FR-070, FR-071, docs/10 `automation_settings`, Q-ACS1) — feat-auto-config-store.
-- Cấu hình cổng tự gửi theo workspace: cf.automation_settings (MỘT dòng/workspace: ngưỡng, trễ, giới hạn/ngày, giờ
-- hoạt động, từ khóa chặn, chữ ký) + cf.automation_rules (mức Tắt/Chạy thử/Tự động của từng ô kênh × đối tượng × nhãn).
--
--  * Chỉ OWNER (hoặc hệ thống) ghi — Staff và withWorkspace trần chỉ đọc. Mỗi lệnh đúng MỘT policy permissive.
--  * automation_settings.updated_by: đường Owner BẮT BUỘC = chính người ghi (không giả danh người khác);
--    đường hệ thống BẮT BUỘC null. FK set null khi người dùng bị xóa (bỏ qua RLS, đúng ý).
--  * automation_rules: FK ghép (workspace_id, channel_id) → channels ⇒ không thể trỏ kênh của workspace khác.
--    Không GRANT UPDATE (đổi mức = xóa + chèn lại trong cùng giao dịch); khóa chính là định danh bất biến.
--  * DB giữ sàn ngưỡng 0,80, trễ ∈ {0,60,120,300}, giới hạn/ngày 1–1000 (phòng thủ chiều sâu; Zod ở ranh giới).
--
-- TRIỂN KHAI: migrate trước; chưa có nơi đọc trong pipeline (nối ở AUTO-CONFIG-WIRE) nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.automation_rules, cf.automation_settings; (và bỏ kỳ vọng ở check-rls.ts) — store web về bộ nhớ.
-- ===================================================================================================
ALTER TABLE cf.automation_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cf.automation_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.automation_settings TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, threshold, delay_seconds, daily_cap, active_hours, blocked_keywords, signature, updated_by)
  ON cf.automation_settings TO cf_app;
--> statement-breakpoint
GRANT UPDATE (threshold, delay_seconds, daily_cap, active_hours, blocked_keywords, signature, updated_by, updated_at)
  ON cf.automation_settings TO cf_app;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.automation_rules TO cf_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, channel_id, target, label, mode) ON cf.automation_rules TO cf_app;
--> statement-breakpoint
CREATE POLICY automation_settings_select ON cf.automation_settings FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY automation_settings_insert ON cf.automation_settings FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND updated_by = (SELECT core.current_user_id()))
      OR ((SELECT core.is_system_context()) AND updated_by IS NOT DISTINCT FROM NULL)
    )
  );
--> statement-breakpoint
CREATE POLICY automation_settings_update ON cf.automation_settings FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (
      ((SELECT core.is_workspace_owner()) AND updated_by = (SELECT core.current_user_id()))
      OR ((SELECT core.is_system_context()) AND updated_by IS NOT DISTINCT FROM NULL)
    )
  );
--> statement-breakpoint
CREATE POLICY automation_rules_select ON cf.automation_rules FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY automation_rules_insert ON cf.automation_rules FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY automation_rules_delete ON cf.automation_rules FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;
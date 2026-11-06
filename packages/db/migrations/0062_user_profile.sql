-- SETTINGS-PROFILE-WIRE (Q-WPROF1): hồ sơ người dùng (múi giờ, giao diện, SĐT đã xác minh) + thử thách OTP.
-- Thiết kế quyền:
--   * timezone, theme: cf_app ĐƯỢC UPDATE (policy users_app_update của 0010 = chỉ dòng của chính mình, không workspace);
--     cf_app KHÔNG được SELECT hai cột này (giữ đúng 7 cột đọc được của 0012 → thành viên khác không đọc được qua workspace).
--   * phone, phone_verified_at: cf_app KHÔNG có quyền nào; chỉ cf_auth (ngữ cảnh 'auth') ghi sau khi OTP đúng.
--   * core.phone_verifications: chỉ cf_auth trong app.ctx = 'auth' (mẫu two_factors 0013); cf_app không có quyền nào.
-- Không UNIQUE theo SĐT: tránh lộ "SĐT này đã có người dùng" (chống liệt kê).
-- Đường lùi (MẤT dữ liệu SĐT/múi giờ/giao diện; chỉ lùi sau khi đã triển khai lại code cũ): DROP TABLE core.phone_verifications;
--   ALTER TABLE core.users DROP COLUMN timezone, DROP COLUMN phone, DROP COLUMN phone_verified_at, DROP COLUMN theme.
--   (Quyền theo cột và các CHECK users_* tự mất cùng cột, không cần REVOKE.)
-- Ghi chú vận hành: không có meta/0062_snapshot.json (migration viết tay, mẫu 0010–0014); quyết định Q-WPROF1.
ALTER TABLE core.users ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
--> statement-breakpoint
ALTER TABLE core.users ADD COLUMN phone text;
--> statement-breakpoint
ALTER TABLE core.users ADD COLUMN phone_verified_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE core.users ADD COLUMN theme text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE core.users ADD CONSTRAINT users_timezone_check CHECK (char_length(timezone) BETWEEN 1 AND 64);
--> statement-breakpoint
ALTER TABLE core.users ADD CONSTRAINT users_theme_check CHECK (theme IN ('light', 'dark', 'system'));
--> statement-breakpoint
ALTER TABLE core.users ADD CONSTRAINT users_phone_check CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
--> statement-breakpoint
ALTER TABLE core.users ADD CONSTRAINT users_phone_verified_check CHECK (phone_verified_at IS NULL OR phone IS NOT NULL);
--> statement-breakpoint
GRANT UPDATE (timezone, theme) ON core.users TO cf_app;
--> statement-breakpoint
GRANT UPDATE (timezone, theme, phone, phone_verified_at) ON core.users TO cf_auth;
--> statement-breakpoint
CREATE TABLE core.phone_verifications (
  user_id uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT phone_verifications_phone_check CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT phone_verifications_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT phone_verifications_attempts_check CHECK (attempts BETWEEN 0 AND 10)
);
--> statement-breakpoint
ALTER TABLE core.phone_verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY phone_verifications_auth_access ON core.phone_verifications FOR ALL TO cf_auth
  USING ((SELECT core.in_auth_context()))
  WITH CHECK ((SELECT core.in_auth_context()));
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON core.phone_verifications TO cf_auth;
--> statement-breakpoint
GRANT UPDATE (phone, code_hash, expires_at, attempts, sent_at) ON core.phone_verifications TO cf_auth;

-- CHANNEL-HEALTH-CHECK (nút "Kiểm tra toàn bộ kết nối", Cài đặt → Kênh): worker kiểm token Page + đăng ký webhook của từng kênh
-- và ghi kết quả để trang Kênh hiển thị.
-- Thiết kế quyền:
--   * last_checked_at, last_check_result: cf_app ĐỌC được (trang Kênh) và ghi được ở mức cột, nhưng trigger
--     cf.guard_channel_user_update chặn người dùng — chỉ ngữ cảnh hệ thống (worker `withJob`) ghi được (giống last_polled_at).
--   * last_check_result ∈ ok (token sống + webhook đã đăng ký) | webhook_missing (token sống, chưa đăng ký webhook) |
--     token_invalid (nền tảng báo token hết hiệu lực → worker đặt status = 'expired') | error (lỗi tạm/không xác định,
--     không đổi status) | unavailable (connector tắt, không gọi nền tảng).
-- Đường lùi: ALTER TABLE cf.channels DROP COLUMN last_checked_at, DROP COLUMN last_check_result; rồi chạy lại phần
-- CREATE OR REPLACE FUNCTION cf.guard_channel_user_update() của 0020 (quyền theo cột và CHECK tự mất cùng cột).
ALTER TABLE "cf"."channels" ADD COLUMN "last_checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cf"."channels" ADD COLUMN "last_check_result" text;
--> statement-breakpoint
ALTER TABLE "cf"."channels" ADD CONSTRAINT "channels_last_check_result_check" CHECK ("cf"."channels"."last_check_result" IS NULL OR "cf"."channels"."last_check_result" IN ('ok', 'webhook_missing', 'token_invalid', 'error', 'unavailable'));
--> statement-breakpoint
GRANT SELECT (last_checked_at, last_check_result) ON cf.channels TO cf_app;
--> statement-breakpoint
GRANT UPDATE (last_checked_at, last_check_result) ON cf.channels TO cf_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cf.guard_channel_user_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Chủ bảng (hàm DEFINER đã tự kiểm quyền; migration/admin) được qua; mọi role khác bị chặn ngoài ngữ cảnh hệ thống.
  IF current_user IS DISTINCT FROM pg_get_userbyid((SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID))
     AND NOT core.is_system_context() AND (
       NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
    OR NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
    OR NEW.scopes IS DISTINCT FROM OLD.scopes
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.webhook_subscribed IS DISTINCT FROM OLD.webhook_subscribed
    OR NEW.capabilities IS DISTINCT FROM OLD.capabilities
    OR NEW.last_polled_at IS DISTINCT FROM OLD.last_polled_at
    OR NEW.last_checked_at IS DISTINCT FROM OLD.last_checked_at
    OR NEW.last_check_result IS DISTINCT FROM OLD.last_check_result
  ) THEN
    RAISE EXCEPTION 'channels: cột do hệ thống quản lý, người dùng chỉ sửa name và reply_language'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

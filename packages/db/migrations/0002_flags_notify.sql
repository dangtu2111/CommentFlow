-- Mọi thay đổi feature flag/override (từ bất kỳ đường ghi nào) phát NOTIFY `flags_changed`
-- để cache trong bộ nhớ của web/worker mất hiệu lực ngay (docs/09 §10).
-- Payload = tên bảng bị đổi (không chứa dữ liệu nhạy cảm); người nhận xóa cache toàn bộ.
-- NOTIFY trong giao dịch chỉ được gửi khi COMMIT.
CREATE FUNCTION core.notify_flags_changed() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_notify('flags_changed', TG_TABLE_NAME);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER feature_flags_notify
  AFTER INSERT OR UPDATE OR DELETE ON core.feature_flags
  FOR EACH STATEMENT EXECUTE FUNCTION core.notify_flags_changed();
--> statement-breakpoint
CREATE TRIGGER feature_flag_overrides_notify
  AFTER INSERT OR UPDATE OR DELETE ON core.feature_flag_overrides
  FOR EACH STATEMENT EXECUTE FUNCTION core.notify_flags_changed();

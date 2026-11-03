-- Hạn 8 giờ của phiên Admin được ÉP TRONG DATABASE (docs/13 §2, ADR 003), cho mọi đường ghi:
-- adapter Better Auth, route /api/auth/*, mã của mình. Better Auth đặt lại hạn = now + 14 ngày mỗi lần làm
-- mới phiên; trigger này cắt về created_at + 8 giờ ở cả INSERT lẫn UPDATE.
-- Đường lùi: DROP TRIGGER sessions_cap_admin ON core.sessions; DROP FUNCTION core.cap_admin_session();
--            GRANT UPDATE ON core.sessions TO cf_app (khôi phục quyền cột rộng của 0001).
CREATE FUNCTION core.cap_admin_session() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- created_at chỉ được lùi (không dời muộn để lách hạn).
    NEW.created_at := LEAST(NEW.created_at, OLD.created_at);
  END IF;
  IF NEW.is_admin_session THEN
    NEW.expires_at := LEAST(NEW.expires_at, NEW.created_at + interval '8 hours');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.cap_admin_session() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER sessions_cap_admin
  BEFORE INSERT OR UPDATE ON core.sessions
  FOR EACH ROW EXECUTE FUNCTION core.cap_admin_session();
--> statement-breakpoint

-- Quyền cột: cf_app chỉ được sửa các cột Better Auth cần khi làm mới phiên. KHÔNG sửa được
-- is_admin_session (không tự nâng/hạ cờ Admin), created_at, user_id, token.
REVOKE UPDATE ON core.sessions FROM cf_app;
--> statement-breakpoint
GRANT UPDATE (expires_at, updated_at, ip, user_agent) ON core.sessions TO cf_app;

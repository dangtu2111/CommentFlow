-- Kiểm chứng độc lập sau 0010: cf_auth có INSERT mức bảng trên core.users nên chèn được người dùng
-- is_admin = true / admin_role = 'super' rồi tạo phiên Admin (trigger 0009 lấy users.is_admin làm mỏ neo tin cậy).
-- Better Auth luôn gửi is_admin = false (giá trị mặc định), nên INSERT theo cột không dùng được; thay bằng policy
-- RESTRICTIVE (AND với policy permissive): cf_auth chỉ INSERT được người dùng KHÔNG phải Admin.
-- Cấp quyền Admin vẫn chỉ qua role chủ sở hữu/Admin riêng.
-- Đồng thời viết lại trigger cap_admin_session để không đọc OLD trong nhánh INSERT.
-- Đường lùi: DROP POLICY users_auth_no_admin_insert ON core.users; CREATE OR REPLACE lại hàm ở 0009.
CREATE POLICY users_auth_no_admin_insert ON core.users AS RESTRICTIVE FOR INSERT TO cf_auth
  WITH CHECK (NOT is_admin AND admin_role IS NULL);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION core.cap_admin_session() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  needs_admin_check boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := LEAST(COALESCE(NEW.created_at, now()), now());
    needs_admin_check := NEW.is_admin_session;
  ELSE
    -- created_at chỉ được lùi (không dời muộn để lách hạn).
    NEW.created_at := LEAST(NEW.created_at, OLD.created_at);
    needs_admin_check := NEW.is_admin_session AND OLD.is_admin_session IS DISTINCT FROM true;
  END IF;

  IF needs_admin_check
     AND NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = NEW.user_id AND u.is_admin) THEN
    RAISE EXCEPTION 'Phiên Admin chỉ được tạo cho người dùng có is_admin = true'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.is_admin_session THEN
    NEW.expires_at := LEAST(NEW.expires_at, NEW.created_at + interval '8 hours');
  END IF;
  RETURN NEW;
END;
$$;

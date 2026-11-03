-- Siết đường INSERT của trigger hạn phiên Admin (kết quả kiểm chứng độc lập lần thứ ba):
--  1) INSERT không được đặt created_at ở TƯƠNG LAI (trước đây mốc "created_at + 8 giờ" có thể nằm xa tùy ý);
--  2) phiên Admin (is_admin_session = true) chỉ được TẠO cho người dùng có users.is_admin = true, và chỉ được
--     BẬT cờ qua UPDATE cho người dùng như vậy.
-- Hàm vẫn SECURITY INVOKER: ngữ cảnh auth thấy mọi users; withUser chỉ thấy chính mình (đúng người sở hữu phiên).
-- Đường lùi: CREATE OR REPLACE lại bản ở 0007_admin_session_cap.sql.
CREATE OR REPLACE FUNCTION core.cap_admin_session() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := LEAST(COALESCE(NEW.created_at, now()), now());
  ELSE
    -- created_at chỉ được lùi (không dời muộn để lách hạn).
    NEW.created_at := LEAST(NEW.created_at, OLD.created_at);
  END IF;

  IF NEW.is_admin_session THEN
    IF (TG_OP = 'INSERT' OR OLD.is_admin_session IS DISTINCT FROM true)
       AND NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = NEW.user_id AND u.is_admin) THEN
      RAISE EXCEPTION 'Phiên Admin chỉ được tạo cho người dùng có is_admin = true'
        USING ERRCODE = '42501';
    END IF;
    NEW.expires_at := LEAST(NEW.expires_at, NEW.created_at + interval '8 hours');
  END IF;
  RETURN NEW;
END;
$$;

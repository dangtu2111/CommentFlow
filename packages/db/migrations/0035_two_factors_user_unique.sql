-- AUTH-HARDEN-4b (FR-001): mỗi user đúng MỘT dòng two_factors (secret TOTP). Chống hai lần bật 2FA chạy song song
-- để lại secret thừa. Ràng buộc UNIQUE tự có chỉ mục nên bỏ chỉ mục thường cũ.
-- Không tự xóa dòng trùng (xóa nhầm secret = khóa người dùng): nếu đã có trùng, migration dừng với thông báo rõ;
-- xử lý tay (giữ dòng verified mới nhất) rồi chạy lại.
-- Đường lùi: ALTER TABLE core.two_factors DROP CONSTRAINT two_factors_user_id_unique;
--            CREATE INDEX two_factors_user_id_idx ON core.two_factors (user_id);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM core.two_factors GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'core.two_factors có user_id trùng — xử lý tay trước khi áp 0035 (UNIQUE user_id)';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "core"."two_factors" ADD CONSTRAINT "two_factors_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
DROP INDEX "core"."two_factors_user_id_idx";

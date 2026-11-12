-- COMMENT-AUTHOR-AVATAR: ảnh đại diện người bình luận. Facebook không kèm ảnh trong webhook; worker lấy qua Graph API sau khi lưu bình luận
-- và lưu URL (chủ dự án đồng ý lưu URL, 12/11/2026). URL của Facebook CDN có chữ ký và hết hạn — giai đoạn đầu chấp nhận.
-- Thiết kế quyền:
--   * Cột `author_avatar_url`: cf_app ĐỌC được (SELECT cấp theo bảng) nhưng KHÔNG UPDATE được (UPDATE cấp theo cột, không có cột này);
--     ghi chỉ qua hàm DEFINER `cf.set_comment_author_avatar` — CHỈ ngữ cảnh hệ thống (worker `withJob`).
--   * Hàm chỉ ghi khi: bình luận thuộc workspace của job, chưa xóa, chưa có ảnh, URL là https ≤ 2048 ký tự.
--   * Quyền riêng tư: ảnh cá nhân của khách. Khi bình luận bị xóa (`deleted_at` được đặt — kể cả đường dấu xóa đến trước) trigger
--     `comments_wipe_avatar` xóa URL, cùng tinh thần với `author_name` (migration 0026).
-- Đường lùi: DROP TRIGGER comments_wipe_avatar ON cf.comments; DROP FUNCTION cf.wipe_comment_avatar(); DROP FUNCTION cf.set_comment_author_avatar(uuid, text);
--   ALTER TABLE cf.comments DROP COLUMN author_avatar_url (CHECK mất cùng cột).
ALTER TABLE "cf"."comments" ADD COLUMN "author_avatar_url" text;
--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_author_avatar_url_check" CHECK ("cf"."comments"."author_avatar_url" IS NULL OR ("cf"."comments"."author_avatar_url" ~ '^https://[^[:space:]]+$' AND length("cf"."comments"."author_avatar_url") <= 2048));
--> statement-breakpoint

CREATE FUNCTION cf.wipe_comment_avatar() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.author_avatar_url := NULL;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Tên bắt đầu bằng 'comments_w' > 'comments_apply_tombstone' nên chạy SAU trigger dấu xóa (BEFORE trigger chạy theo thứ tự tên).
CREATE TRIGGER comments_wipe_avatar BEFORE INSERT OR UPDATE ON cf.comments
  FOR EACH ROW EXECUTE FUNCTION cf.wipe_comment_avatar();
--> statement-breakpoint

CREATE FUNCTION cf.set_comment_author_avatar(p_comment_id uuid, p_url text) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_comment_id IS NULL OR p_url IS NULL OR p_url !~ '^https://[^[:space:]]+$' OR length(p_url) > 2048 THEN
    RAISE EXCEPTION 'invalid avatar url' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.comments
     SET author_avatar_url = p_url
   WHERE id = p_comment_id AND workspace_id = v_ws
     AND deleted_at IS NULL AND is_own = false AND author_avatar_url IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_comment_author_avatar(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_comment_author_avatar(uuid, text) TO cf_app;

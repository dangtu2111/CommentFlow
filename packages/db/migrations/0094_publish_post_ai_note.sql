-- COMPOSER-AI-NOTE (Q-PUB5): Owner viết "ghi chú riêng cho AI" khi soạn bài (khách không thấy). Khi bài ĐĂNG THÀNH CÔNG, hệ thống tạo ghi chú ở `cf.post_notes`
-- (bảng có sẵn từ 0045; pipeline AI đã đọc ghi chú còn hiệu lực của bài khi tư vấn bình luận). Ghi chú do CON NGƯỜI viết; AI không tạo ghi chú.
-- Chỉ THÊM: cột `cf.publish_posts.ai_note` (1–1000 ký tự, trùng giới hạn của post_notes), hàm Owner `set_publish_post_note`, và thay thân hàm NỘI BỘ
-- `link_published_post_products` (giữ chữ ký; tạo `cf.posts` + liên kết sản phẩm + ghi chú). Lỗi ở hàm này vẫn bị `record_publish_result` bắt (không làm hỏng kết quả đăng).
-- Đường lùi: nạp lại thân `link_published_post_products` từ 0091; DROP FUNCTION cf.set_publish_post_note(uuid, text);
--   ALTER TABLE cf.publish_posts DROP COLUMN ai_note (mất ghi chú của bài chưa đăng; ghi chú đã ghi ở cf.post_notes giữ nguyên).
ALTER TABLE "cf"."publish_posts" ADD COLUMN "ai_note" text;
--> statement-breakpoint
ALTER TABLE "cf"."publish_posts" ADD CONSTRAINT "publish_posts_ai_note_check" CHECK ("ai_note" IS NULL OR char_length("ai_note") BETWEEN 1 AND 1000);
--> statement-breakpoint

-- Owner đặt (hoặc xóa khi rỗng/NULL) ghi chú riêng cho AI của một bài NHÁP/ĐÃ LÊN LỊCH.
CREATE FUNCTION cf.set_publish_post_note(p_post_id uuid, p_note text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note too long' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.publish_posts SET ai_note = v_note, updated_at = now()
   WHERE id = p_post_id AND workspace_id = v_ws AND status IN ('draft', 'scheduled');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not editable' USING ERRCODE = '55000';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_publish_post_note(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_publish_post_note(uuid, text) TO cf_app;
--> statement-breakpoint

-- NỘI BỘ (chỉ gọi từ record_publish_result): tạo dòng cf.posts cho bài vừa đăng, liên kết "đã xác nhận" theo lựa chọn của Owner và ghi chú riêng cho AI (nếu có).
CREATE OR REPLACE FUNCTION cf.link_published_post_products(p_target_id uuid, p_external_id text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_post uuid;
  v_channel uuid;
  v_message text;
  v_note text;
  v_fb_post uuid;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT t.post_id, t.channel_id, p.message, p.ai_note INTO v_post, v_channel, v_message, v_note
    FROM cf.publish_post_targets t JOIN cf.publish_posts p ON p.id = t.post_id
   WHERE t.id = p_target_id AND t.workspace_id = v_ws;
  IF v_post IS NULL THEN
    RETURN;
  END IF;
  IF v_note IS NULL AND NOT EXISTS (SELECT 1 FROM cf.publish_post_products WHERE post_id = v_post) THEN
    RETURN;
  END IF;
  INSERT INTO cf.posts (workspace_id, channel_id, external_id, message, created_time)
  VALUES (v_ws, v_channel, p_external_id, v_message, now())
  ON CONFLICT (channel_id, external_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_fb_post;
  INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, is_primary, suggested_by_ai, confirmed_by)
  SELECT v_ws, v_fb_post, pp.product_id, 'confirmed', pp.position = 0, false, pp.confirmed_by
    FROM cf.publish_post_products pp
   WHERE pp.post_id = v_post
     AND EXISTS (SELECT 1 FROM cf.products pr WHERE pr.id = pp.product_id AND pr.workspace_id = v_ws AND pr.status = 'active')
  ON CONFLICT (workspace_id, post_id, product_id) DO NOTHING;
  IF v_note IS NOT NULL THEN
    INSERT INTO cf.post_notes (workspace_id, post_id, content)
    SELECT v_ws, v_fb_post, v_note
     WHERE NOT EXISTS (SELECT 1 FROM cf.post_notes n WHERE n.workspace_id = v_ws AND n.post_id = v_fb_post AND n.content = v_note AND n.valid_to IS NULL);
  END IF;
END
$$;

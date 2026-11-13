-- CALENDAR-DND (Q-PUB6): sửa nhanh MỘT bài ngay trên Lịch (kéo thả sang ngày khác, hộp thoại chỉnh nội dung/giờ) mà KHÔNG đụng kênh, ảnh/video, sản phẩm, ghi chú.
-- Hàm DEFINER chỉ cho Owner (withActor): đổi nội dung và/hoặc giờ đăng của bài NHÁP/ĐÃ LÊN LỊCH chưa có mục tiêu nào đi tiếp. `p_scheduled_at` NULL → bài là bản nháp;
-- có giờ → lên lịch (cần nội dung, ít nhất một kênh, kênh vẫn `connected` và là Facebook, giờ cách hiện tại 2 phút – 90 ngày). Ghi `action_logs` (không kèm nội dung bài).
-- Chỉ THÊM hàm. Đường lùi: DROP FUNCTION cf.update_publish_post(uuid, text, timestamptz);
CREATE FUNCTION cf.update_publish_post(p_id uuid, p_message text, p_scheduled_at timestamptz) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_message text := coalesce(p_message, '');
  v_status text;
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_message) > 63206 THEN
    RAISE EXCEPTION 'message too long' USING ERRCODE = '22023';
  END IF;
  IF p_scheduled_at IS NOT NULL THEN
    IF btrim(v_message) = '' THEN
      RAISE EXCEPTION 'schedule needs content' USING ERRCODE = '22023';
    END IF;
    IF p_scheduled_at < now() + interval '2 minutes' OR p_scheduled_at > now() + interval '90 days' THEN
      RAISE EXCEPTION 'invalid schedule' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cf.publish_post_targets t WHERE t.post_id = p_id AND t.workspace_id = v_ws) THEN
      RAISE EXCEPTION 'schedule needs channel' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM cf.publish_post_targets t JOIN cf.channels ch ON ch.id = t.channel_id
       WHERE t.post_id = p_id AND t.workspace_id = v_ws AND (ch.platform <> 'facebook' OR ch.status <> 'connected')
    ) THEN
      RAISE EXCEPTION 'invalid channel' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_status := CASE WHEN p_scheduled_at IS NULL THEN 'draft' ELSE 'scheduled' END;
  UPDATE cf.publish_posts
     SET message = v_message, status = v_status, scheduled_at = p_scheduled_at, updated_at = now()
   WHERE id = p_id AND workspace_id = v_ws AND status IN ('draft', 'scheduled')
     AND NOT EXISTS (SELECT 1 FROM cf.publish_post_targets t WHERE t.post_id = p_id AND t.status <> 'pending');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not editable' USING ERRCODE = '55000';
  END IF;
  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (v_ws, 'user', core.current_user_id(), 'publish_post.updated', 'publish_post', p_id::text,
          jsonb_build_object('status', v_status, 'via', 'calendar'));
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.update_publish_post(uuid, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.update_publish_post(uuid, text, timestamptz) TO cf_app;

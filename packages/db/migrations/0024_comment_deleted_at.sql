ALTER TABLE "cf"."comments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cf"."comments" ADD COLUMN "text_synced_at" timestamp with time zone;

--> statement-breakpoint
-- ===================================================================================================
-- COMMENT-EDIT-DELETE (feat/comment-sync, FR-048): khách xóa bình luận trên nền tảng → đặt deleted_at (KHÔNG xóa dòng:
-- giữ log). Chỉ đường hệ thống (worker, job ingest) ghi; trigger chặn người dùng đổi cột này. cf.request_comment_reply
-- từ chối bình luận đã xóa (CF409). Hai hàm dưới là bản 0023 + đúng các điều kiện trên.
--
-- text_synced_at: thời điểm (theo nền tảng) của lần sửa nội dung đã áp dụng gần nhất — lần sửa CŨ đến muộn (retry) không
-- được ghi đè lần sửa mới; chỉ hệ thống ghi (trigger chặn người dùng).
--
-- Đường lùi: LÙI CODE ỨNG DỤNG TRƯỚC (inbox/chi tiết/job send đọc deleted_at), rồi CREATE OR REPLACE lại hai hàm bằng bản 0023
-- (không có deleted_at), rồi ALTER TABLE cf.comments DROP COLUMN deleted_at, DROP COLUMN text_synced_at.
-- ===================================================================================================

GRANT UPDATE (deleted_at, text_synced_at) ON cf.comments TO cf_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.guard_comment_user_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Chủ bảng (hàm DEFINER đã tự kiểm quyền; migration/admin) và đường hệ thống (worker) được qua.
  IF current_user IS NOT DISTINCT FROM pg_get_userbyid((SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID))
     OR core.is_system_context() THEN
    RETURN NEW;
  END IF;

  -- Đường người dùng: không sửa dữ liệu nền tảng/khách viết, cờ chống vòng lặp, nghi mạo danh, dấu vết gửi.
  IF NEW.text IS DISTINCT FROM OLD.text
     OR NEW.text_normalized IS DISTINCT FROM OLD.text_normalized
     OR NEW.lang IS DISTINCT FROM OLD.lang
     OR NEW.author_name IS DISTINCT FROM OLD.author_name
     OR NEW.attachments IS DISTINCT FROM OLD.attachments
     OR NEW.is_own IS DISTINCT FROM OLD.is_own
     OR NEW.is_impersonation_suspected IS DISTINCT FROM OLD.is_impersonation_suspected
     OR NEW.external_reply_id IS DISTINCT FROM OLD.external_reply_id
     OR NEW.replied_at IS DISTINCT FROM OLD.replied_at
     OR NEW.private_replied_at IS DISTINCT FROM OLD.private_replied_at
     OR (NEW.label_source IS DISTINCT FROM OLD.label_source AND NEW.label_source IS DISTINCT FROM 'human')
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.text_synced_at IS DISTINCT FROM OLD.text_synced_at
  THEN
    RAISE EXCEPTION 'comments: dữ liệu nền tảng/dấu vết gửi do hệ thống quản lý, người dùng không sửa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- "Ai đã trả lời" do hệ thống ghi (hàm DEFINER/worker): người dùng không sửa (không nhận công, không xóa dấu vết).
  IF NEW.replied_by IS DISTINCT FROM OLD.replied_by THEN
    RAISE EXCEPTION 'comments: replied_by do hệ thống ghi' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Khóa mềm: giá trị mới phải là NULL hoặc chính người gọi; và KHÔNG được ghi đè/xóa khóa CÒN HẠN của người khác.
  IF NEW.locked_by IS DISTINCT FROM OLD.locked_by
     AND NEW.locked_by IS NOT NULL AND NEW.locked_by IS DISTINCT FROM core.current_user_id() THEN
    RAISE EXCEPTION 'comments: locked_by phải là người gọi' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.locked_by IS DISTINCT FROM OLD.locked_by OR NEW.locked_until IS DISTINCT FROM OLD.locked_until)
     AND OLD.locked_by IS NOT NULL AND OLD.locked_by IS DISTINCT FROM core.current_user_id()
     AND OLD.locked_until > now() THEN
    RAISE EXCEPTION 'comments: khóa của người khác còn hạn' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Trạng thái: người dùng chỉ chuyển giữa {skipped, pending_review, needs_human} từ trạng thái "của người".
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status NOT IN ('new', 'pending_review', 'needs_human', 'send_failed', 'skipped', 'spam_suspected')
       OR NEW.status NOT IN ('skipped', 'pending_review', 'needs_human') THEN
      RAISE EXCEPTION 'comments: người dùng không được đặt trạng thái % (từ %)', NEW.status, OLD.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.request_comment_reply(p_comment_id uuid, p_text text) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_user uuid := core.current_user_id();
  v_text text := regexp_replace(coalesce(p_text, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_comment record;
  v_channel_status text;
  v_id uuid;
BEGIN
  IF v_ws IS NULL OR v_user IS NULL OR core.is_workspace_member() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_text IS NULL OR char_length(v_text) NOT BETWEEN 1 AND 8000 THEN
    RAISE EXCEPTION 'invalid_text' USING ERRCODE = 'CF422';
  END IF;

  SELECT c.id, c.channel_id, c.status, c.is_hidden, c.merged_into_id, c.external_reply_id, c.deleted_at, c.locked_by, c.locked_until
    INTO v_comment
    FROM cf.comments c
   WHERE c.id = p_comment_id AND c.workspace_id = v_ws
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'CF404';
  END IF;
  IF v_comment.external_reply_id IS NOT NULL
     OR v_comment.is_hidden
     OR v_comment.merged_into_id IS NOT NULL
     OR v_comment.deleted_at IS NOT NULL
     OR v_comment.status NOT IN ('new', 'pending_review', 'needs_human', 'send_failed') THEN
    RAISE EXCEPTION 'comment_not_replyable' USING ERRCODE = 'CF409';
  END IF;
  SELECT ch.status INTO v_channel_status
    FROM cf.channels ch
   WHERE ch.id = v_comment.channel_id AND ch.workspace_id = v_ws;
  IF v_channel_status IS DISTINCT FROM 'connected' THEN
    RAISE EXCEPTION 'channel_not_connected' USING ERRCODE = 'CF424';
  END IF;
  IF v_comment.locked_by IS NOT NULL AND v_comment.locked_by <> v_user AND v_comment.locked_until > now() THEN
    RAISE EXCEPTION 'locked_by_other' USING ERRCODE = 'CF423';
  END IF;

  INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, requested_by, previous_status)
  VALUES (v_ws, v_comment.channel_id, v_comment.id, v_text, v_user, v_comment.status)
  RETURNING id INTO v_id;
  UPDATE cf.comments SET status = 'sending' WHERE id = v_comment.id AND workspace_id = v_ws;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (v_ws, 'user', v_user, 'comment.reply_requested', 'comment', v_comment.id::text,
          jsonb_build_object('reply_id', v_id));
  RETURN v_id;
END
$$;

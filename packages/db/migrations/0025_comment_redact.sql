ALTER TABLE "cf"."comments" ADD COLUMN "redacted_at" timestamp with time zone;

--> statement-breakpoint
-- ===================================================================================================
-- COMMENT-PRIVACY-ON-DELETE (feat/comment-redact, FR-048, quyết định chủ dự án 05/11/2026): khách xóa bình luận → GIỮ
-- dòng, trạng thái, thời điểm, liên kết comment_replies, action_logs; XÓA TRẮNG text, text_normalized, author_name,
-- author_external_id (+ attachments: có thể chứa ảnh/liên kết của khách) và ghi redacted_at; xóa bản sao nội dung trong
-- webhook_events.payload của chính bình luận đó.
--
-- Làm bằng MỘT hàm DEFINER hẹp, chỉ đường hệ thống (job) gọi được; cf_app mất quyền cột UPDATE(deleted_at) để KHÔNG còn đường
-- nào đặt deleted_at mà quên xóa trắng. Trigger guard_comment_user_update chặn người dùng đổi redacted_at/author_external_id.
-- Backfill: bình luận đã deleted_at từ migration 0024 cũng được xóa trắng (chạy bằng chủ bảng nên qua trigger).
--
-- TRIỂN KHAI: migrate rồi bật worker bản mới ngay (hàm mới + REVOKE UPDATE (deleted_at) cùng migration: worker bản cũ đặt deleted_at
-- trực tiếp sẽ bị 42501 cho tới khi cập nhật).
--
-- Đường lùi: LÙI CODE TRƯỚC (job ingest gọi hàm này); DROP FUNCTION cf.mark_comment_deleted; GRANT UPDATE (deleted_at) ON
-- cf.comments TO cf_app; CREATE OR REPLACE guard_comment_user_update bằng bản 0024; DROP COLUMN redacted_at. Nội dung đã xóa
-- trắng KHÔNG khôi phục được (cố ý).
-- ===================================================================================================

CREATE OR REPLACE FUNCTION cf.mark_comment_deleted(p_channel_id uuid, p_external_id text, p_deleted_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_id uuid;
  v_channel_external text;
  v_platform text;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE cf.comments
     SET deleted_at = COALESCE(p_deleted_at, now()),
         redacted_at = now(),
         text = '',
         text_normalized = NULL,
         author_name = NULL,
         author_external_id = '',
         attachments = '[]'::jsonb
   WHERE workspace_id = v_ws AND channel_id = p_channel_id AND external_id = p_external_id AND deleted_at IS NULL
  RETURNING id INTO v_id;

  SELECT ch.external_id, ch.platform INTO v_channel_external, v_platform
    FROM cf.channels ch WHERE ch.id = p_channel_id AND ch.workspace_id = v_ws;
  -- Bản sao nội dung trong sự kiện tạo/sửa của CHÍNH bình luận này: xóa payload; dòng chưa xử lý/đang lỗi → dead để
  -- worker không tạo lại nội dung. Sự kiện xóa (không có nội dung) và sự kiện khác giữ nguyên.
  UPDATE cf.webhook_events
     SET payload = '{}'::jsonb,
         status = CASE WHEN status IN ('received', 'processing', 'failed') THEN 'dead' ELSE status END,
         error = CASE WHEN status IN ('received', 'processing', 'failed') THEN 'redacted' ELSE error END
   WHERE workspace_id = v_ws
     AND platform = v_platform
     AND payload->>'channelExternalId' = v_channel_external
     AND payload->'comment'->>'externalId' = p_external_id;
  -- Chạy VÔ ĐIỀU KIỆN (kể cả khi chưa có/đã xóa dòng): sự kiện tạo/sửa đến trước hoặc muộn vẫn bị xóa nội dung.
  RETURN v_id;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.mark_comment_deleted(uuid, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.mark_comment_deleted(uuid, text, timestamptz) TO cf_app;
--> statement-breakpoint
REVOKE UPDATE (deleted_at) ON cf.comments FROM cf_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.guard_comment_user_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  -- Chủ bảng (hàm DEFINER đã tự kiểm quyền; migration/admin) được qua.
  IF current_user IS NOT DISTINCT FROM pg_get_userbyid((SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID)) THEN
    RETURN NEW;
  END IF;
  -- Dòng đã xóa trắng (FR-048): KHÔNG vai nào ngoài chủ bảng được ghi lại nội dung/danh tính hay gỡ dấu xóa.
  IF OLD.redacted_at IS NOT NULL
     AND (NEW.text IS DISTINCT FROM OLD.text
          OR NEW.text_normalized IS DISTINCT FROM OLD.text_normalized
          OR NEW.author_name IS DISTINCT FROM OLD.author_name
          OR NEW.author_external_id IS DISTINCT FROM OLD.author_external_id
          OR NEW.attachments IS DISTINCT FROM OLD.attachments
          OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
          OR NEW.redacted_at IS DISTINCT FROM OLD.redacted_at) THEN
    RAISE EXCEPTION 'comments: bình luận đã xóa trắng, không ghi lại nội dung' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Đường hệ thống (worker) được qua phần còn lại.
  IF core.is_system_context() THEN
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
     OR NEW.redacted_at IS DISTINCT FROM OLD.redacted_at
     OR NEW.author_external_id IS DISTINCT FROM OLD.author_external_id
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

-- Backfill: bình luận đã bị đánh dấu xóa từ trước (migration 0024) cũng xóa trắng + payload sự kiện của chúng.
UPDATE cf.webhook_events w
   SET payload = '{}'::jsonb,
       status = CASE WHEN w.status IN ('received', 'processing', 'failed') THEN 'dead' ELSE w.status END,
       error = CASE WHEN w.status IN ('received', 'processing', 'failed') THEN 'redacted' ELSE w.error END
  FROM cf.comments c
  JOIN cf.channels ch ON ch.id = c.channel_id AND ch.workspace_id = c.workspace_id
 WHERE c.deleted_at IS NOT NULL AND c.redacted_at IS NULL
   AND w.workspace_id = c.workspace_id AND w.platform = ch.platform
   AND w.payload->>'channelExternalId' = ch.external_id
   AND w.payload->'comment'->>'externalId' = c.external_id;
--> statement-breakpoint
UPDATE cf.comments
   SET redacted_at = now(), text = '', text_normalized = NULL, author_name = NULL, author_external_id = '', attachments = '[]'::jsonb
 WHERE deleted_at IS NOT NULL AND redacted_at IS NULL;

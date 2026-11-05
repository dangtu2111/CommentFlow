CREATE TABLE "cf"."comment_hides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"action" text NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"previous_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "comment_hides_action_check" CHECK ("cf"."comment_hides"."action" in ('hide', 'unhide')),
	CONSTRAINT "comment_hides_status_check" CHECK ("cf"."comment_hides"."status" in ('queued', 'sending', 'done', 'failed', 'cancelled')),
	CONSTRAINT "comment_hides_previous_status_check" CHECK ("cf"."comment_hides"."previous_status" in ('new', 'pending_review', 'needs_human', 'send_failed', 'skipped', 'spam_suspected', 'replied', 'auto_replied')),
	CONSTRAINT "comment_hides_attempts_check" CHECK ("cf"."comment_hides"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cf"."comment_hides" ADD CONSTRAINT "comment_hides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_hides" ADD CONSTRAINT "comment_hides_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_hides" ADD CONSTRAINT "comment_hides_comment_fk" FOREIGN KEY ("workspace_id","comment_id") REFERENCES "cf"."comments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_hides" ADD CONSTRAINT "comment_hides_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_hides_one_active_per_comment" ON "cf"."comment_hides" USING btree ("workspace_id","comment_id") WHERE "cf"."comment_hides"."status" in ('queued', 'sending');--> statement-breakpoint
CREATE INDEX "comment_hides_workspace_comment_idx" ON "cf"."comment_hides" USING btree ("workspace_id","comment_id");--> statement-breakpoint
CREATE INDEX "comment_hides_workspace_channel_idx" ON "cf"."comment_hides" USING btree ("workspace_id","channel_id");

--> statement-breakpoint
-- ===================================================================================================
-- FB-HIDE (feat/fb-hide, FR-044, ADR 009): hàng đợi ẩn/bỏ ẩn bình luận (outbox) + hàm DEFINER yêu cầu/hủy + siết trigger.
--  * cf.comment_hides: RLS; SELECT thành viên đang hoạt động hoặc đường hệ thống; UPDATE (cột kết quả) CHỈ đường hệ
--    thống (worker, job `hide`); cf_app KHÔNG INSERT/DELETE (INSERT chỉ qua cf.request_comment_hide).
--  * cf.request_comment_hide(comment_id, hide): thành viên đang hoạt động (withActor). Kiểm: bình luận ở workspace hiện
--    tại, chưa xóa/gộp; yêu cầu đang chạy cùng chiều → NULL (idempotent), trái chiều → CF409; đã ở trạng thái đích →
--    NULL; ẩn chỉ từ {new, pending_review, needs_human, send_failed, skipped, spam_suspected, replied, auto_replied};
--    bỏ ẩn cần is_hidden; kênh `connected`; không ai khác giữ khóa mềm còn hạn. Thành công → outbox `queued` + action_logs
--    (KHÔNG nội dung). Bình luận KHÔNG đổi ở bước này: is_hidden/status='hidden' chỉ do worker ghi SAU khi nền tảng xác
--    nhận. SQLSTATE: CF404 không thấy · CF409 không ẩn/bỏ ẩn được · CF423 người khác giữ khóa · CF424 kênh không kết nối
--    · 42501 không có quyền. `previous_status` của `unhide` = trạng thái khôi phục (lần ẩn xong gần nhất; mặc định
--    `replied` nếu có external_reply_id, ngược lại `pending_review`).
--  * cf.cancel_comment_hide(hide_id): người yêu cầu hủy yêu cầu còn `queued` (bù khi đẩy job thất bại).
--  * cf.request_comment_reply (thay bản 0024): thêm — từ chối (CF409) khi bình luận đang có yêu cầu ẩn/bỏ ẩn hoạt động.
--  * cf.guard_comment_user_update (thay bản 0025): thêm — đường người dùng KHÔNG đổi comments.is_hidden (đóng nửa
--    `is_hidden` của gap COMMENT-HIDE-MERGE-GUARD; `merged_into_id` còn mở cho việc gộp).
--
-- Đường lùi: LÙI CODE TRƯỚC (web gọi hàm hide; worker job `hide`); CREATE OR REPLACE lại cf.guard_comment_user_update bản
-- 0025 và cf.request_comment_reply bản 0024; DROP FUNCTION cf.request_comment_hide(uuid, boolean),
-- cf.cancel_comment_hide(uuid); DROP TABLE cf.comment_hides.
-- ===================================================================================================

ALTER TABLE cf.comment_hides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.comment_hides TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status, attempts, error_code, updated_at, done_at) ON cf.comment_hides TO cf_app;
--> statement-breakpoint
CREATE POLICY comment_hides_select ON cf.comment_hides FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY comment_hides_update ON cf.comment_hides FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND (SELECT core.is_system_context())
  );
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
     OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden
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
     OR EXISTS (SELECT 1 FROM cf.comment_hides h
                 WHERE h.workspace_id = v_ws AND h.comment_id = v_comment.id AND h.status IN ('queued', 'sending'))
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
--> statement-breakpoint

CREATE FUNCTION cf.request_comment_hide(p_comment_id uuid, p_hide boolean) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_user uuid := core.current_user_id();
  v_comment record;
  v_active_action text;
  v_channel_status text;
  v_previous text;
  v_id uuid;
BEGIN
  IF v_ws IS NULL OR v_user IS NULL OR core.is_workspace_member() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_hide IS NULL THEN
    RAISE EXCEPTION 'comment_not_hideable' USING ERRCODE = 'CF409';
  END IF;

  SELECT c.id, c.channel_id, c.status, c.is_hidden, c.merged_into_id, c.external_reply_id, c.deleted_at,
         c.locked_by, c.locked_until
    INTO v_comment
    FROM cf.comments c
   WHERE c.id = p_comment_id AND c.workspace_id = v_ws
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'CF404';
  END IF;
  IF v_comment.deleted_at IS NOT NULL OR v_comment.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'comment_not_hideable' USING ERRCODE = 'CF409';
  END IF;

  -- Đang có yêu cầu hoạt động: cùng chiều → không có việc mới (idempotent); trái chiều → từ chối.
  SELECT h.action INTO v_active_action
    FROM cf.comment_hides h
   WHERE h.workspace_id = v_ws AND h.comment_id = v_comment.id AND h.status IN ('queued', 'sending');
  IF FOUND THEN
    IF v_active_action = (CASE WHEN p_hide THEN 'hide' ELSE 'unhide' END) THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'comment_not_hideable' USING ERRCODE = 'CF409';
  END IF;

  -- Đã ở trạng thái đích: không làm gì (idempotent).
  IF v_comment.is_hidden = p_hide THEN
    RETURN NULL;
  END IF;

  IF p_hide THEN
    IF v_comment.status NOT IN ('new', 'pending_review', 'needs_human', 'send_failed', 'skipped',
                                'spam_suspected', 'replied', 'auto_replied') THEN
      RAISE EXCEPTION 'comment_not_hideable' USING ERRCODE = 'CF409';
    END IF;
    v_previous := v_comment.status;
  ELSE
    SELECT h.previous_status INTO v_previous
      FROM cf.comment_hides h
     WHERE h.workspace_id = v_ws AND h.comment_id = v_comment.id AND h.action = 'hide' AND h.status = 'done'
     ORDER BY h.created_at DESC, h.id DESC
     LIMIT 1;
    IF v_previous IS NULL THEN
      v_previous := CASE WHEN v_comment.external_reply_id IS NOT NULL THEN 'replied' ELSE 'pending_review' END;
    END IF;
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

  INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, requested_by, previous_status)
  VALUES (v_ws, v_comment.channel_id, v_comment.id, CASE WHEN p_hide THEN 'hide' ELSE 'unhide' END, v_user, v_previous)
  RETURNING id INTO v_id;

  INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
  VALUES (v_ws, 'user', v_user,
          CASE WHEN p_hide THEN 'comment.hide_requested' ELSE 'comment.unhide_requested' END,
          'comment', v_comment.id::text, jsonb_build_object('hide_id', v_id));
  RETURN v_id;
END
$$;
--> statement-breakpoint

CREATE FUNCTION cf.cancel_comment_hide(p_hide_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_user uuid := core.current_user_id();
  v_hide record;
BEGIN
  IF v_ws IS NULL OR v_user IS NULL OR core.is_workspace_member() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT h.id, h.requested_by, h.status
    INTO v_hide
    FROM cf.comment_hides h
   WHERE h.id = p_hide_id AND h.workspace_id = v_ws
     FOR UPDATE;
  IF NOT FOUND OR v_hide.requested_by IS DISTINCT FROM v_user OR v_hide.status <> 'queued' THEN
    RETURN false;
  END IF;
  UPDATE cf.comment_hides
     SET status = 'cancelled', error_code = 'cancelled_by_user', updated_at = now()
   WHERE id = v_hide.id;
  RETURN true;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.request_comment_hide(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.cancel_comment_hide(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.request_comment_hide(uuid, boolean) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.cancel_comment_hide(uuid) TO cf_app;

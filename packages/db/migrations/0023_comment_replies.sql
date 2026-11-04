CREATE TABLE "cf"."comment_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"text" text NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"external_reply_id" text,
	"error_code" text,
	"previous_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "comment_replies_status_check" CHECK ("cf"."comment_replies"."status" in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
	CONSTRAINT "comment_replies_text_check" CHECK (char_length("cf"."comment_replies"."text") between 1 and 8000)
);
--> statement-breakpoint
ALTER TABLE "cf"."comment_replies" ADD CONSTRAINT "comment_replies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_replies" ADD CONSTRAINT "comment_replies_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_replies" ADD CONSTRAINT "comment_replies_comment_fk" FOREIGN KEY ("workspace_id","comment_id") REFERENCES "cf"."comments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cf"."comment_replies" ADD CONSTRAINT "comment_replies_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "cf"."channels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_replies_one_active_per_comment" ON "cf"."comment_replies" USING btree ("workspace_id","comment_id") WHERE "cf"."comment_replies"."status" in ('queued', 'sending');--> statement-breakpoint
CREATE INDEX "comment_replies_workspace_comment_idx" ON "cf"."comment_replies" USING btree ("workspace_id","comment_id");--> statement-breakpoint

-- ===================================================================================================
-- FB-REPLY (feat/reply-backend, ADR 008): hàng đợi gửi trả lời (outbox) + hàm DEFINER yêu cầu/hủy + siết trigger bình luận.
--  * cf.comment_replies: RLS; SELECT thành viên đang hoạt động hoặc đường hệ thống; UPDATE (cột kết quả) CHỈ đường hệ
--    thống (worker, job `send`); cf_app KHÔNG INSERT/DELETE (INSERT chỉ qua cf.request_comment_reply).
--  * cf.request_comment_reply(comment_id, text): người gọi là thành viên đang hoạt động (withActor). Kiểm: bình luận
--    tồn tại ở workspace hiện tại, chưa trả lời/ẩn/gộp, trạng thái ∈ {new, pending_review, needs_human, send_failed},
--    kênh `connected`, không ai khác giữ khóa mềm còn hạn, nội dung 1–8000 ký tự sau trim. Thành công → outbox `queued`
--    + bình luận `sending` + action_logs (KHÔNG kèm nội dung). Lỗi nghiệp vụ dùng SQLSTATE riêng (không đổi gì):
--      CF404 không thấy · CF409 không trả lời được ở trạng thái này · CF423 người khác đang giữ khóa ·
--      CF424 kênh không còn kết nối · CF422 nội dung không hợp lệ · 42501 không có quyền.
--  * cf.cancel_comment_reply(reply_id): người yêu cầu hủy yêu cầu còn `queued` (bù khi đẩy job thất bại), trả bình luận
--    về trạng thái trước; trả false nếu không đủ điều kiện.
--  * Trigger cf.guard_comment_user_update (thay bản 0019): miễn CHỦ BẢNG (hàm DEFINER đã tự kiểm quyền) và đường hệ
--    thống; đường người dùng KHÔNG đặt được trạng thái hệ thống (sending/replied/auto_replied/send_failed/
--    scheduled_auto/processing/spam_suspected/hidden), không đổi trạng thái khi bình luận đang ở trạng thái hệ thống,
--    không sửa external_reply_id/replied_at/private_replied_at; label_source chỉ được đặt 'human' (đổi nhãn tay); người dùng chỉ chuyển giữa
--    {skipped, pending_review, needs_human} từ {new, pending_review, needs_human, send_failed, skipped, spam_suspected}.
--    (Giải quyết gap COMMENTS-STATUS-GUARD.)
--
-- Đường lùi: khôi phục cf.guard_comment_user_update bản 0019 (không miễn chủ bảng, không chặn trạng thái); DROP FUNCTION
-- cf.request_comment_reply(uuid, text), cf.cancel_comment_reply(uuid); DROP TABLE cf.comment_replies.
-- ===================================================================================================

ALTER TABLE cf.comment_replies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.comment_replies TO cf_app;
--> statement-breakpoint
GRANT UPDATE (status, attempts, external_reply_id, error_code, sent_at, updated_at) ON cf.comment_replies TO cf_app;
--> statement-breakpoint
CREATE POLICY comment_replies_select ON cf.comment_replies FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_system_context()) OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY comment_replies_update ON cf.comment_replies FOR UPDATE
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
  THEN
    RAISE EXCEPTION 'comments: dữ liệu nền tảng/dấu vết gửi do hệ thống quản lý, người dùng không sửa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Không ghi tên người khác vào "ai đã trả lời"/"ai đang khóa": giá trị mới phải là NULL hoặc chính người gọi.
  IF NEW.replied_by IS DISTINCT FROM OLD.replied_by
     AND NEW.replied_by IS NOT NULL AND NEW.replied_by IS DISTINCT FROM core.current_user_id() THEN
    RAISE EXCEPTION 'comments: replied_by phải là người gọi' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.locked_by IS DISTINCT FROM OLD.locked_by
     AND NEW.locked_by IS NOT NULL AND NEW.locked_by IS DISTINCT FROM core.current_user_id() THEN
    RAISE EXCEPTION 'comments: locked_by phải là người gọi' USING ERRCODE = 'insufficient_privilege';
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

CREATE FUNCTION cf.request_comment_reply(p_comment_id uuid, p_text text) RETURNS uuid
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

  SELECT c.id, c.channel_id, c.status, c.is_hidden, c.merged_into_id, c.external_reply_id, c.locked_by, c.locked_until
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

CREATE FUNCTION cf.cancel_comment_reply(p_reply_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_user uuid := core.current_user_id();
  v_reply record;
BEGIN
  IF v_ws IS NULL OR v_user IS NULL OR core.is_workspace_member() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT r.id, r.comment_id, r.requested_by, r.status, r.previous_status
    INTO v_reply
    FROM cf.comment_replies r
   WHERE r.id = p_reply_id AND r.workspace_id = v_ws
     FOR UPDATE;
  IF NOT FOUND OR v_reply.requested_by IS DISTINCT FROM v_user OR v_reply.status <> 'queued' THEN
    RETURN false;
  END IF;
  UPDATE cf.comment_replies
     SET status = 'cancelled', error_code = 'cancelled_by_user', updated_at = now()
   WHERE id = v_reply.id;
  UPDATE cf.comments
     SET status = v_reply.previous_status
   WHERE id = v_reply.comment_id AND workspace_id = v_ws AND status = 'sending';
  RETURN true;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.request_comment_reply(uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.cancel_comment_reply(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.request_comment_reply(uuid, text) TO cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.cancel_comment_reply(uuid) TO cf_app;

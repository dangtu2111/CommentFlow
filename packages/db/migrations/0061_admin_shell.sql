CREATE TABLE "core"."admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"session_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"target_workspace_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_log_role_check" CHECK ("core"."admin_audit_log"."actor_role" in ('super', 'support', 'finance')),
	CONSTRAINT "admin_audit_log_action_check" CHECK ("core"."admin_audit_log"."action" ~ '^[a-z][a-z0-9_.]{2,63}$'),
	CONSTRAINT "admin_audit_log_target_check" CHECK (("core"."admin_audit_log"."target_type" is null or "core"."admin_audit_log"."target_type" ~ '^[a-z][a-z0-9_]{1,39}$') and ("core"."admin_audit_log"."target_id" is null or "core"."admin_audit_log"."target_id" ~ '^[A-Za-z0-9_.:-]{1,128}$')),
	CONSTRAINT "admin_audit_log_detail_check" CHECK (jsonb_typeof("core"."admin_audit_log"."detail") = 'object' and octet_length("core"."admin_audit_log"."detail"::text) <= 2000)
);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "core"."admin_audit_log" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
-- ===================================================================================================
-- ADMIN-SHELL phần DB (FR-100, FR-118, AUTH-ADMIN-SESSION, docs/13 §2 + §3.2, Q-ADSH1) — feat-admin-shell-db.
--  * core.admin_audit_log: nhật ký thao tác Admin CHỈ THÊM. RLS bật KHÔNG policy; cf_app/cf_worker/cf_auth không có quyền nào
--    (kể cả SELECT). Trigger chặn UPDATE/DELETE/TRUNCATE kể cả chủ bảng (muốn sửa phải DROP TRIGGER có chủ đích bằng migration).
--    Không khóa ngoại: dòng sống lâu hơn người dùng/workspace/phiên (đối chiếu core.workspace_deletion_requests, 0055).
--  * core.require_admin_session(p_session_id, p_roles): lớp kiểm dùng chung. Người gọi phải là người dùng đăng nhập (app.user_id),
--    KHÔNG ngữ cảnh workspace, KHÔNG hệ thống, KHÔNG phải session_user = cf_worker; is_admin + admin_role ∈ p_roles (sai → 42501,
--    không lộ phiên có tồn tại hay không); sau đó phiên p_session_id phải THUỘC người đó, is_admin_session, expires_at > now()
--    VÀ created_at + 8 giờ > now() (lớp thứ hai ngoài trigger cap_admin_session) — không thì CF401 'admin_session_invalid'.
--    Vai trò + người thực hiện luôn lấy từ DB (users/phiên), không nhận từ tham số.
--  * core.admin_session_status (mọi vai trò Admin), core.record_admin_action (mọi vai trò Admin), core.admin_list_audit (CHỈ Super).
--  * Giới hạn ADR 005 §3: tiến trình web bị chiếm hoàn toàn tự đặt được app.user_id VÀ đọc được id phiên Admin của người đó
--    (policy sessions_own_select) nên id phiên KHÔNG chống được mạo danh khi web bị chiếm — chỉ chống nhầm lẫn. Cô lập thật cần
--    role LOGIN riêng cf_admin và/hoặc đối chiếu token phiên — hoãn (ADMIN-SHELL-ROLE/-WIRE, cần hạ tầng tạo role).
--    Chưa kiểm totp_enabled ở DB (middleware ép 2FA, ADMIN-SHELL-WIRE). Nhật ký ghi cùng giao dịch của thao tác (rollback → mất dòng).
-- Đường lùi: DROP FUNCTION core.admin_list_audit(uuid, integer, timestamptz, uuid),
--   core.record_admin_action(uuid, text, text, text, uuid, jsonb), core.admin_session_status(uuid),
--   core.require_admin_session(uuid, text[]); DROP TABLE core.admin_audit_log; DROP FUNCTION core.admin_audit_log_immutable();
--   và lùi check-rls.ts. Mất nhật ký đã ghi.
-- ===================================================================================================
ALTER TABLE core.admin_audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON core.admin_audit_log FROM PUBLIC, cf_app, cf_worker, cf_auth;
--> statement-breakpoint
CREATE FUNCTION core.admin_audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only' USING ERRCODE = '42501';
END
$$;
--> statement-breakpoint
CREATE TRIGGER admin_audit_log_no_update_delete BEFORE UPDATE OR DELETE ON core.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION core.admin_audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER admin_audit_log_no_truncate BEFORE TRUNCATE ON core.admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION core.admin_audit_log_immutable();
--> statement-breakpoint
CREATE FUNCTION core.require_admin_session(p_session_id uuid, p_roles text[]) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_role text;
BEGIN
  IF session_user = 'cf_worker'
     OR v_user IS NULL
     OR p_session_id IS NULL
     OR p_roles IS NULL
     OR core.current_workspace_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT u.admin_role INTO v_role
    FROM core.users u
   WHERE u.id = v_user AND u.is_admin AND u.admin_role = ANY (p_roles);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.sessions s
                  WHERE s.id = p_session_id
                    AND s.user_id = v_user
                    AND s.is_admin_session
                    AND s.expires_at > now()
                    AND s.created_at + interval '8 hours' > now()) THEN
    RAISE EXCEPTION 'admin_session_invalid' USING ERRCODE = 'CF401';
  END IF;
  RETURN v_role;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.require_admin_session(uuid, text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.require_admin_session(uuid, text[]) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.admin_session_status(p_session_id uuid)
RETURNS TABLE (admin_role text, expires_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_role text := core.require_admin_session(p_session_id, ARRAY['super', 'support', 'finance']);
BEGIN
  RETURN QUERY
    SELECT v_role, LEAST(s.expires_at, s.created_at + interval '8 hours')
      FROM core.sessions s WHERE s.id = p_session_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.admin_session_status(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.admin_session_status(uuid) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.record_admin_action(
  p_session_id uuid, p_action text, p_target_type text, p_target_id text,
  p_target_workspace_id uuid, p_detail jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
DECLARE
  v_user uuid := core.current_user_id();
  v_role text := core.require_admin_session(p_session_id, ARRAY['super', 'support', 'finance']);
  v_detail jsonb := COALESCE(p_detail, '{}'::jsonb);
  v_id uuid;
BEGIN
  IF p_action IS NULL OR p_action !~ '^[a-z][a-z0-9_.]{2,63}$'
     OR (p_target_type IS NOT NULL AND p_target_type !~ '^[a-z][a-z0-9_]{1,39}$')
     OR (p_target_id IS NOT NULL AND p_target_id !~ '^[A-Za-z0-9_.:-]{1,128}$')
     OR jsonb_typeof(v_detail) <> 'object'
     OR octet_length(v_detail::text) > 2000 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.admin_audit_log
    (actor_user_id, actor_role, session_id, action, target_type, target_id, target_workspace_id, detail)
  VALUES (v_user, v_role, p_session_id, p_action, p_target_type, p_target_id, p_target_workspace_id, v_detail)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.record_admin_action(uuid, text, text, text, uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.record_admin_action(uuid, text, text, text, uuid, jsonb) TO cf_app;
--> statement-breakpoint
CREATE FUNCTION core.admin_list_audit(p_session_id uuid, p_limit integer, p_before_at timestamptz, p_before_id uuid)
RETURNS TABLE (
  id uuid, actor_user_id uuid, actor_role text, action text, target_type text, target_id text,
  target_workspace_id uuid, detail jsonb, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, pg_temp
AS $$
BEGIN
  PERFORM core.require_admin_session(p_session_id, ARRAY['super']);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT a.id, a.actor_user_id, a.actor_role, a.action, a.target_type, a.target_id,
           a.target_workspace_id, a.detail, a.created_at
      FROM core.admin_audit_log a
     WHERE p_before_at IS NULL OR (a.created_at, a.id) < (p_before_at, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT p_limit;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.admin_list_audit(uuid, integer, timestamptz, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.admin_list_audit(uuid, integer, timestamptz, uuid) TO cf_app;

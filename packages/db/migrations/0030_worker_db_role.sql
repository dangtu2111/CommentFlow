-- ===================================================================================================
-- WORKER-DB-ROLE (feat/worker-db-role; ADR 011, ADR 007 §2): role DB riêng cho worker.
--
-- Trước: web và worker cùng đăng nhập bằng cf_app; `app.ctx` là biến tự do nên web bị chiếm hoàn toàn tự đặt
-- `app.ctx = 'system'`, thành "hệ thống" và gọi được cf.read_channel_token (ciphertext token Page).
--
--  1) Role `cf_worker` (LOGIN, tạo NGOÀI migration vì cf_owner không có CREATEROLE — script khởi tạo Postgres hoặc
--     `pnpm cf:dev add-worker-role`; cùng mẫu cf_auth ở 0010) là THÀNH VIÊN của cf_app: kế thừa mọi quyền bảng/hàm/policy
--     của cf_app (không nhân đôi GRANT; policy `TO cf_app` áp cho cf_worker). Ngược lại cf_app KHÔNG thuộc cf_worker
--     (không SET ROLE sang được). Migration chỉ KIỂM role tồn tại và đúng thuộc tính, thiếu → lỗi hướng dẫn.
--  2) core.is_system_context() thêm điều kiện `session_user = 'cf_worker'` (role ĐĂNG NHẬP của kết nối; SET ROLE không đổi
--     được session_user, chỉ superuser mới SET SESSION AUTHORIZATION). Mọi policy và hàm DEFINER chỉ-hệ thống (kênh, posts,
--     comments INSERT, webhook_events, read_channel_token, hàm xóa/ẩn/ghi kết quả gửi…) được bảo vệ cùng lúc mà không
--     phải sửa từng nơi. cf_app (web) đặt app.ctx = 'system' vẫn KHÔNG thành hệ thống.
--  3) cf.read_channel_token: thu hồi EXECUTE khỏi cf_app, cấp riêng cf_worker (lớp phòng thủ thứ hai ngoài kiểm
--     is_system_context). Các hàm ghi token (create/set/clear) giữ cho cf_app: Owner ghi token ở callback OAuth (web).
--  4) GRANT CONNECT cho cf_worker (database hiện tại).
--
-- Không đổi bảng/policy/dữ liệu. Chỉ KHÔNG còn "hệ thống" với kết nối cf_app: worker PHẢI chạy bằng DATABASE_WORKER_URL
-- (cf_worker) TRƯỚC khi migrate lên môi trường có worker đang chạy (worker cũ dùng cf_app sẽ mất quyền hệ thống).
--
-- `lock_timeout = 5s` ở ĐẦU file (SET LOCAL, hiệu lực cả giao dịch migrate): CREATE OR REPLACE FUNCTION / REVOKE / GRANT
-- chỉ cần khóa ngắn trên catalog; quá 5s thì thất bại rõ ràng thay vì xếp hàng.
--
-- Đường lùi (LÙI SQL VÀ check-rls CÙNG LÚC, RỒI MỚI đổi worker về DATABASE_URL — worker cf_app khi 0030 còn hiệu lực mất quyền hệ thống): CREATE OR REPLACE core.is_system_context() về bản 0020
-- (COALESCE(current_setting('app.ctx', true) = 'system' AND core.current_user_id() IS NULL, false)); GRANT EXECUTE ON
-- FUNCTION cf.read_channel_token(uuid) TO cf_app; REVOKE EXECUTE … FROM cf_worker; REVOKE CONNECT ON DATABASE … FROM cf_worker.
-- Role cf_worker giữ nguyên (xóa bằng DROP ROLE bởi superuser).
-- ===================================================================================================

SET LOCAL lock_timeout = '5s';
--> statement-breakpoint

DO $$
DECLARE
  v_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO v_role FROM pg_roles WHERE rolname = 'cf_worker';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thiếu role cf_worker: tạo bằng infra/scripts/cf-dev-add-worker-role.sh (dev), script khởi tạo Postgres (volume mới) hoặc docs/staging/H5-CHECKLIST.md (staging) trước khi migrate.';
  END IF;
  IF NOT v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolbypassrls OR v_role.rolcreaterole OR v_role.rolcreatedb THEN
    RAISE EXCEPTION 'Role cf_worker sai thuộc tính: cần LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB.';
  END IF;
  IF NOT pg_has_role('cf_worker', 'cf_app', 'usage') THEN
    RAISE EXCEPTION 'Role cf_worker phải là thành viên (INHERIT) của cf_app: GRANT cf_app TO cf_worker (bởi superuser).';
  END IF;
  IF pg_has_role('cf_app', 'cf_worker', 'member') THEN
    RAISE EXCEPTION 'cf_app không được là thành viên của cf_worker (web sẽ nâng quyền thành worker được).';
  END IF;
  -- cf_worker không được thừa hưởng quyền chủ sở hữu schema (cf_owner) hay role đang migrate: sẽ vượt mọi RLS/GRANT.
  IF EXISTS (SELECT 1 FROM pg_roles o
             WHERE o.rolname IN ('cf_owner', current_user) AND o.rolname <> 'cf_worker'
               AND pg_has_role('cf_worker', o.oid, 'member')) THEN
    RAISE EXCEPTION 'cf_worker không được là thành viên của cf_owner (hoặc role chạy migration): REVOKE cf_owner FROM cf_worker.';
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cf_worker', current_database());
END
$$;
--> statement-breakpoint

-- Chỉ kết nối đăng nhập bằng cf_worker mới là hệ thống. COALESCE giữ nguyên (luôn true/false, không NULL).
CREATE OR REPLACE FUNCTION core.is_system_context() RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, core, pg_temp
AS $$
  SELECT COALESCE(
    current_setting('app.ctx', true) = 'system'
    AND core.current_user_id() IS NULL
    AND session_user = 'cf_worker',
    false)
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION cf.read_channel_token(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cf.read_channel_token(uuid) FROM cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.read_channel_token(uuid) TO cf_worker;
--> statement-breakpoint

SET LOCAL lock_timeout = DEFAULT;

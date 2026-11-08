-- ===================================================================================================
-- EMBED-ACTIVE-MODEL (sửa 0079) — trigger `enforce_embedding_write` chỉ kiểm cột vector ĐANG ĐƯỢC ĐỔI. CHỈ thay thân hàm (CREATE OR REPLACE), không đổi bảng/quyền.
--
-- Lỗi gặp khi chạy `kb:switch-embedding` trên dev: dòng CŨ có vector chính của model cũ/giả (mock-embed-v1, active_model NULL). Ghi vector ĐỆM (`embedding_next`) cho dòng
-- đó làm trigger kiểm luôn cả vector chính (không đổi) → từ chối "model mock-embed-v1 khác model đang hoạt động <NULL>" → không bao giờ chuyển được model.
-- Sửa: INSERT kiểm cả hai cặp; UPDATE chỉ kiểm cặp cột nào THỰC SỰ đổi so với OLD (vector hoặc tên model đổi). Ghi vector chính sai model vẫn bị chặn.
-- (So vector qua ::text vì search_path của hàm không có `public` (nơi pgvector đặt toán tử) và halfvec không có toán tử `=` hiển thị. Dùng IF lồng nhau, không dùng OR: PL/pgSQL không đảm bảo ngắn mạch và `OLD` chưa gán khi INSERT.)
-- Đường lùi: CREATE OR REPLACE FUNCTION cf.enforce_embedding_write() lại bằng thân hàm ở 0079.
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cf.enforce_embedding_write() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cf, pg_temp
AS $$
DECLARE
  v_active text;
  v_pending text;
  v_main_changed boolean;
  v_next_changed boolean;
BEGIN
  IF session_user NOT IN ('cf_app', 'cf_worker') THEN
    RETURN NEW;
  END IF;
  SELECT active_model, pending_model INTO v_active, v_pending FROM cf.embedding_state;
  IF TG_TABLE_NAME = 'kb_chunks' THEN
    IF TG_OP = 'INSERT' THEN
      v_main_changed := true;
      v_next_changed := true;
    ELSE
      v_main_changed := NEW.embedding::text IS DISTINCT FROM OLD.embedding::text OR NEW.embedding_model IS DISTINCT FROM OLD.embedding_model;
      v_next_changed := NEW.embedding_next::text IS DISTINCT FROM OLD.embedding_next::text OR NEW.embedding_next_model IS DISTINCT FROM OLD.embedding_next_model;
    END IF;
    IF v_main_changed AND NEW.embedding IS NOT NULL AND (v_active IS NULL OR NEW.embedding_model IS DISTINCT FROM v_active) THEN
      RAISE EXCEPTION 'embedding model % khác model đang hoạt động %', NEW.embedding_model, v_active USING ERRCODE = '23514';
    END IF;
    IF v_next_changed AND NEW.embedding_next IS NOT NULL AND (v_pending IS NULL OR NEW.embedding_next_model IS DISTINCT FROM v_pending) THEN
      RAISE EXCEPTION 'embedding_next model % khác model đang chuyển %', NEW.embedding_next_model, v_pending USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      v_main_changed := true;
      v_next_changed := true;
    ELSE
      v_main_changed := NEW.name_embedding::text IS DISTINCT FROM OLD.name_embedding::text OR NEW.name_embedding_model IS DISTINCT FROM OLD.name_embedding_model;
      v_next_changed := NEW.name_embedding_next::text IS DISTINCT FROM OLD.name_embedding_next::text OR NEW.name_embedding_next_model IS DISTINCT FROM OLD.name_embedding_next_model;
    END IF;
    IF v_main_changed AND NEW.name_embedding IS NOT NULL AND (v_active IS NULL OR NEW.name_embedding_model IS DISTINCT FROM v_active) THEN
      RAISE EXCEPTION 'name_embedding model % khác model đang hoạt động %', NEW.name_embedding_model, v_active USING ERRCODE = '23514';
    END IF;
    IF v_next_changed AND NEW.name_embedding_next IS NOT NULL AND (v_pending IS NULL OR NEW.name_embedding_next_model IS DISTINCT FROM v_pending) THEN
      RAISE EXCEPTION 'name_embedding_next model % khác model đang chuyển %', NEW.name_embedding_next_model, v_pending USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

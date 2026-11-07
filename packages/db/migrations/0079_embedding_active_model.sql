-- ===================================================================================================
-- EMBED-ACTIVE-MODEL (chủ dự án chốt 08/11/2026, bổ sung FR-133) — lệch model embedding KHÔNG THỂ xảy ra (không chỉ phát hiện). CHỈ THÊM.
--
-- 1) cf.embedding_state: bảng hệ thống MỘT dòng, nguồn DUY NHẤT của model đang hoạt động (`active_model`, NULL = chưa kích hoạt → không có nhánh vector)
--    + `pending_model` (model đang tạo bản mới) + `revision`. KHÔNG RLS; cf_app/cf_worker CHỈ SELECT (như system_abbreviations, 0041). Chỉ đổi qua hàm DEFINER.
-- 2) Cột đệm: kb_chunks.embedding_next(+_model), products.name_embedding_next(+_model): vector của model MỚI tạo song song trong lúc truy vấn vẫn dùng model cũ.
-- 3) Trigger cf.enforce_embedding_write (CHỈ áp cho kết nối runtime cf_app/cf_worker; migration/admin/test dựng dữ liệu không bị): vector ghi vào
--    `embedding`/`name_embedding` PHẢI kèm model = active_model; ghi vào cột đệm PHẢI kèm model = pending_model. Sai → lỗi, không ghi.
-- 4) Hàm DEFINER (chỉ cf_worker, ngữ cảnh hệ thống, như 0074):
--      cf.begin_embedding_switch(p_model)            đặt pending_model, xóa vector đệm của model khác;
--      cf.list_embedding_switch_pending(p_model, n)  workspace còn dòng chưa có vector đệm đúng model;
--      cf.switch_active_embedding(p_model, p_rev)    KHÓA bảng, đòi 100% dòng có vector đệm đúng model, rồi trong MỘT giao dịch: đổi active_model,
--                                                    chuyển cột đệm → cột chính, xóa đệm. Thiếu/lỗi giữa chừng → ROLLBACK, giữ nguyên model cũ.
--    Không có thời điểm model hoạt động và vector chính khác nhau (đổi active TRƯỚC khi chuyển cột, cùng giao dịch; bảng bị khóa ghi suốt thời gian đó).
-- Ghi nhận: UPDATE toàn bảng khi chuyển có chi phí bảo trì chỉ mục HNSW (bảng còn nhỏ; khóa chỉ chặn GHI, không chặn đọc).
-- Đường lùi: DROP TRIGGER kb_chunks_enforce_embedding ON cf.kb_chunks; DROP TRIGGER products_enforce_embedding ON cf.products;
--   DROP FUNCTION cf.enforce_embedding_write(), cf.begin_embedding_switch(text), cf.list_embedding_switch_pending(text, integer), cf.switch_active_embedding(text, bigint);
--   ALTER TABLE cf.kb_chunks DROP COLUMN embedding_next, DROP COLUMN embedding_next_model; ALTER TABLE cf.products DROP COLUMN name_embedding_next, DROP COLUMN name_embedding_next_model;
--   DROP TABLE cf.embedding_state;
-- ===================================================================================================
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "cf"."embedding_state" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"active_model" text,
	"pending_model" text,
	"revision" bigint DEFAULT 1 NOT NULL,
	"switched_at" timestamp with time zone,
	CONSTRAINT "embedding_state_singleton" CHECK ("id"),
	CONSTRAINT "embedding_state_active_check" CHECK ("active_model" IS NULL OR char_length("active_model") BETWEEN 1 AND 100),
	CONSTRAINT "embedding_state_pending_check" CHECK ("pending_model" IS NULL OR char_length("pending_model") BETWEEN 1 AND 100)
);
--> statement-breakpoint
INSERT INTO cf.embedding_state (id) VALUES (true);
--> statement-breakpoint
GRANT SELECT ON cf.embedding_state TO cf_app;
--> statement-breakpoint
ALTER TABLE "cf"."kb_chunks" ADD COLUMN "embedding_next" halfvec(1024);
--> statement-breakpoint
ALTER TABLE "cf"."kb_chunks" ADD COLUMN "embedding_next_model" text;
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD COLUMN "name_embedding_next" halfvec(1024);
--> statement-breakpoint
ALTER TABLE "cf"."products" ADD COLUMN "name_embedding_next_model" text;
--> statement-breakpoint
GRANT UPDATE (embedding_next, embedding_next_model) ON cf.kb_chunks TO cf_app;
--> statement-breakpoint
GRANT UPDATE (name_embedding_next, name_embedding_next_model) ON cf.products TO cf_app;
--> statement-breakpoint
CREATE FUNCTION cf.enforce_embedding_write() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cf, pg_temp
AS $$
DECLARE
  v_active text;
  v_pending text;
BEGIN
  IF session_user NOT IN ('cf_app', 'cf_worker') THEN
    RETURN NEW;
  END IF;
  SELECT active_model, pending_model INTO v_active, v_pending FROM cf.embedding_state;
  IF TG_TABLE_NAME = 'kb_chunks' THEN
    IF NEW.embedding IS NOT NULL AND (v_active IS NULL OR NEW.embedding_model IS DISTINCT FROM v_active) THEN
      RAISE EXCEPTION 'embedding model % khác model đang hoạt động %', NEW.embedding_model, v_active USING ERRCODE = '23514';
    END IF;
    IF NEW.embedding_next IS NOT NULL AND (v_pending IS NULL OR NEW.embedding_next_model IS DISTINCT FROM v_pending) THEN
      RAISE EXCEPTION 'embedding_next model % khác model đang chuyển %', NEW.embedding_next_model, v_pending USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.name_embedding IS NOT NULL AND (v_active IS NULL OR NEW.name_embedding_model IS DISTINCT FROM v_active) THEN
      RAISE EXCEPTION 'name_embedding model % khác model đang hoạt động %', NEW.name_embedding_model, v_active USING ERRCODE = '23514';
    END IF;
    IF NEW.name_embedding_next IS NOT NULL AND (v_pending IS NULL OR NEW.name_embedding_next_model IS DISTINCT FROM v_pending) THEN
      RAISE EXCEPTION 'name_embedding_next model % khác model đang chuyển %', NEW.name_embedding_next_model, v_pending USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER kb_chunks_enforce_embedding
  BEFORE INSERT OR UPDATE OF embedding, embedding_model, embedding_next, embedding_next_model ON cf.kb_chunks
  FOR EACH ROW EXECUTE FUNCTION cf.enforce_embedding_write();
--> statement-breakpoint
CREATE TRIGGER products_enforce_embedding
  BEFORE INSERT OR UPDATE OF name_embedding, name_embedding_model, name_embedding_next, name_embedding_next_model ON cf.products
  FOR EACH ROW EXECUTE FUNCTION cf.enforce_embedding_write();
--> statement-breakpoint
CREATE FUNCTION cf.begin_embedding_switch(p_model text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR session_user <> 'cf_worker' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_model IS NULL OR char_length(p_model) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'model không hợp lệ' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM cf.embedding_state FOR UPDATE;
  UPDATE cf.kb_chunks SET embedding_next = NULL, embedding_next_model = NULL
    WHERE embedding_next IS NOT NULL AND embedding_next_model IS DISTINCT FROM p_model;
  UPDATE cf.products SET name_embedding_next = NULL, name_embedding_next_model = NULL
    WHERE name_embedding_next IS NOT NULL AND name_embedding_next_model IS DISTINCT FROM p_model;
  UPDATE cf.embedding_state SET pending_model = p_model;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION cf.list_embedding_switch_pending(p_model text, p_limit integer)
RETURNS TABLE (workspace_id uuid, chunks bigint, products bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
BEGIN
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR session_user <> 'cf_worker' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT w.workspace_id, sum(w.c)::bigint, sum(w.p)::bigint FROM (
      SELECT k.workspace_id, count(*) AS c, 0::bigint AS p FROM cf.kb_chunks k
        WHERE k.embedding_next_model IS DISTINCT FROM p_model OR k.embedding_next IS NULL GROUP BY k.workspace_id
      UNION ALL
      SELECT pr.workspace_id, 0::bigint, count(*) FROM cf.products pr
        WHERE pr.name_embedding_next_model IS DISTINCT FROM p_model OR pr.name_embedding_next IS NULL GROUP BY pr.workspace_id
    ) w GROUP BY w.workspace_id ORDER BY w.workspace_id LIMIT greatest(1, least(coalesce(p_limit, 100), 1000));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION cf.switch_active_embedding(p_model text, p_expected_revision bigint) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_state cf.embedding_state%ROWTYPE;
  v_missing bigint;
  v_revision bigint;
BEGIN
  IF core.current_workspace_id() IS NOT NULL
     OR core.current_user_id() IS NOT NULL
     OR core.is_system_context() IS NOT FALSE
     OR session_user <> 'cf_worker' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_state FROM cf.embedding_state FOR UPDATE;
  IF v_state.pending_model IS DISTINCT FROM p_model OR v_state.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'chưa begin_embedding_switch cho model này hoặc revision đã đổi' USING ERRCODE = '55000';
  END IF;
  -- Khóa GHI (đọc vẫn chạy): không dòng nào chen vào giữa lúc kiểm đủ và lúc chuyển.
  LOCK TABLE cf.kb_chunks, cf.products IN SHARE ROW EXCLUSIVE MODE;
  SELECT (SELECT count(*) FROM cf.kb_chunks WHERE embedding_next IS NULL OR embedding_next_model IS DISTINCT FROM p_model)
       + (SELECT count(*) FROM cf.products WHERE name_embedding_next IS NULL OR name_embedding_next_model IS DISTINCT FROM p_model)
    INTO v_missing;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'còn % dòng chưa có vector đệm của model % — không chuyển', v_missing, p_model USING ERRCODE = '55000';
  END IF;
  -- Đổi model hoạt động TRƯỚC (trigger thấy model mới), rồi chuyển cột; tất cả trong giao dịch này.
  UPDATE cf.embedding_state
     SET active_model = p_model, pending_model = NULL, revision = revision + 1, switched_at = now()
   RETURNING revision INTO v_revision;
  UPDATE cf.kb_chunks
     SET embedding = embedding_next, embedding_model = embedding_next_model, embedding_next = NULL, embedding_next_model = NULL;
  UPDATE cf.products
     SET name_embedding = name_embedding_next, name_embedding_model = name_embedding_next_model,
         name_embedding_next = NULL, name_embedding_next_model = NULL;
  RETURN v_revision;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.begin_embedding_switch(text) FROM PUBLIC, cf_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.list_embedding_switch_pending(text, integer) FROM PUBLIC, cf_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.switch_active_embedding(text, bigint) FROM PUBLIC, cf_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.begin_embedding_switch(text) TO cf_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.list_embedding_switch_pending(text, integer) TO cf_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.switch_active_embedding(text, bigint) TO cf_worker;
--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;

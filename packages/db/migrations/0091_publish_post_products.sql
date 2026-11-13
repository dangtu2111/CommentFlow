-- COMPOSER-PRODUCT-TAG (Q-PUB3): Owner gắn sản phẩm vào bài khi soạn; khi bài ĐĂNG THÀNH CÔNG, hệ thống tạo dòng `cf.posts` (nếu webhook chưa tạo) và liên kết
-- "đã xác nhận" trong `cf.post_products` với `confirmed_by` = Owner đã chọn (việc chọn khi soạn chính là xác nhận của con người). KHÔNG nới RLS của `post_products`:
-- mọi ghi đi qua hàm DEFINER nội bộ; AI không tạo liên kết nào. Lỗi gắn sản phẩm không làm hỏng việc ghi kết quả đăng (bắt lỗi, ghi `action_logs`).
-- Chỉ THÊM: bảng `cf.publish_post_products`, hàm `set_publish_post_products` (Owner), `link_published_post_products` (nội bộ), và thay thân `record_publish_result` (giữ chữ ký).
-- Đường lùi: nạp lại thân `record_publish_result` từ 0090; DROP FUNCTION cf.link_published_post_products(uuid, text), cf.set_publish_post_products(uuid, uuid[]);
--   DROP TABLE cf.publish_post_products (chỉ mất lựa chọn sản phẩm của bài chưa đăng; liên kết đã ghi ở cf.post_products giữ nguyên).
CREATE TABLE "cf"."publish_post_products" (
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_post_products_pk" PRIMARY KEY("post_id", "product_id"),
	CONSTRAINT "publish_post_products_position_check" CHECK ("position" BETWEEN 0 AND 4)
);
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_products" ADD CONSTRAINT "publish_post_products_post_fk" FOREIGN KEY ("post_id") REFERENCES "cf"."publish_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_products" ADD CONSTRAINT "publish_post_products_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "cf"."products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_products" ADD CONSTRAINT "publish_post_products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cf"."publish_post_products" ADD CONSTRAINT "publish_post_products_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE cf.publish_post_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.publish_post_products TO cf_app;
--> statement-breakpoint
CREATE POLICY publish_post_products_select ON cf.publish_post_products FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint

-- Owner đặt danh sách sản phẩm của một bài NHÁP/ĐÃ LÊN LỊCH (thay toàn bộ; thứ tự đầu = sản phẩm chính; tối đa 5; chỉ sản phẩm đang bán của workspace).
CREATE FUNCTION cf.set_publish_post_products(p_post_id uuid, p_product_ids uuid[]) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_ids uuid[];
BEGIN
  IF v_ws IS NULL OR core.is_workspace_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(x.p ORDER BY x.o), '{}'::uuid[]) INTO v_ids
    FROM (SELECT u.p, min(u.o) AS o FROM unnest(coalesce(p_product_ids, '{}'::uuid[])) WITH ORDINALITY AS u(p, o) GROUP BY u.p) x;
  IF cardinality(v_ids) > 5 THEN
    RAISE EXCEPTION 'too many products' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cf.publish_posts WHERE id = p_post_id AND workspace_id = v_ws AND status IN ('draft', 'scheduled')) THEN
    RAISE EXCEPTION 'post not editable' USING ERRCODE = '55000';
  END IF;
  IF cardinality(v_ids) > 0 AND (
       SELECT count(*) FROM cf.products pr WHERE pr.id = ANY (v_ids) AND pr.workspace_id = v_ws AND pr.status = 'active'
     ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid product' USING ERRCODE = '22023';
  END IF;
  DELETE FROM cf.publish_post_products WHERE post_id = p_post_id AND workspace_id = v_ws;
  INSERT INTO cf.publish_post_products (workspace_id, post_id, product_id, position, confirmed_by)
  SELECT v_ws, p_post_id, x.p, (x.o - 1)::smallint, core.current_user_id()
    FROM unnest(v_ids) WITH ORDINALITY AS x(p, o);
END
$$;
--> statement-breakpoint

-- NỘI BỘ (chỉ gọi từ record_publish_result; KHÔNG cấp cho cf_app/cf_worker): tạo dòng cf.posts cho bài vừa đăng và liên kết "đã xác nhận" theo lựa chọn của Owner.
CREATE FUNCTION cf.link_published_post_products(p_target_id uuid, p_external_id text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_post uuid;
  v_channel uuid;
  v_message text;
  v_fb_post uuid;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT t.post_id, t.channel_id, p.message INTO v_post, v_channel, v_message
    FROM cf.publish_post_targets t JOIN cf.publish_posts p ON p.id = t.post_id
   WHERE t.id = p_target_id AND t.workspace_id = v_ws;
  IF v_post IS NULL OR NOT EXISTS (SELECT 1 FROM cf.publish_post_products WHERE post_id = v_post) THEN
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
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cf.record_publish_result(p_target_id uuid, p_outcome text, p_external_id text, p_error text) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, cf, pg_temp
AS $$
DECLARE
  v_ws uuid := core.current_workspace_id();
  v_post uuid;
  v_rows integer;
BEGIN
  IF v_ws IS NULL OR core.is_system_context() IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('published', 'failed', 'unknown', 'retry') THEN
    RAISE EXCEPTION 'invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'published' AND p_external_id IS NULL THEN
    RAISE EXCEPTION 'published needs external id' USING ERRCODE = '22023';
  END IF;
  UPDATE cf.publish_post_targets t
     SET status = CASE p_outcome WHEN 'retry' THEN 'pending' ELSE p_outcome END,
         external_post_id = CASE WHEN p_outcome = 'published' THEN p_external_id ELSE t.external_post_id END,
         error_code = CASE WHEN p_outcome = 'published' THEN NULL ELSE p_error END,
         published_at = CASE WHEN p_outcome = 'published' THEN now() ELSE t.published_at END,
         claimed_at = CASE WHEN p_outcome = 'retry' THEN NULL ELSE t.claimed_at END,
         updated_at = now()
   WHERE t.id = p_target_id AND t.workspace_id = v_ws AND t.status = 'publishing'
  RETURNING t.post_id INTO v_post;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN false;
  END IF;
  PERFORM cf.recompute_publish_post(v_post);
  IF p_outcome = 'published' THEN
    -- Liên kết bài ↔ sản phẩm do Owner CHỌN lúc soạn (việc chọn = xác nhận). Lỗi ở đây KHÔNG được làm hỏng việc ghi kết quả đăng: bài đã lên Facebook.
    BEGIN
      PERFORM cf.link_published_post_products(p_target_id, p_external_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
      VALUES (v_ws, 'system', NULL, 'publish_post.product_link_failed', 'publish_post', v_post::text,
              jsonb_build_object('target', p_target_id, 'sqlstate', SQLSTATE));
    END;
  END IF;
  IF p_outcome <> 'retry' THEN
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
    VALUES (v_ws, 'system', NULL, 'publish_post.' || p_outcome, 'publish_post', v_post::text,
            jsonb_build_object('target', p_target_id, 'error', p_error));
  END IF;
  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.set_publish_post_products(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cf.link_published_post_products(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cf.set_publish_post_products(uuid, uuid[]) TO cf_app;

CREATE TABLE "cf"."abbreviations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"short" text NOT NULL,
	"full" text NOT NULL,
	"lang" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abbreviations_workspace_lang_short_unique" UNIQUE("workspace_id","lang","short"),
	CONSTRAINT "abbreviations_lang_check" CHECK ("cf"."abbreviations"."lang" in ('vi', 'en')),
	CONSTRAINT "abbreviations_short_check" CHECK ("cf"."abbreviations"."short" = lower("cf"."abbreviations"."short") and "cf"."abbreviations"."short" !~ '\s' and char_length("cf"."abbreviations"."short") between 1 and 32),
	CONSTRAINT "abbreviations_full_check" CHECK (char_length("cf"."abbreviations"."full") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "cf"."system_abbreviations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short" text NOT NULL,
	"full" text NOT NULL,
	"lang" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_abbreviations_lang_short_unique" UNIQUE("lang","short"),
	CONSTRAINT "system_abbreviations_lang_check" CHECK ("cf"."system_abbreviations"."lang" in ('vi', 'en')),
	CONSTRAINT "system_abbreviations_short_check" CHECK ("cf"."system_abbreviations"."short" = lower("cf"."system_abbreviations"."short") and "cf"."system_abbreviations"."short" !~ '\s' and char_length("cf"."system_abbreviations"."short") between 1 and 32),
	CONSTRAINT "system_abbreviations_full_check" CHECK (char_length("cf"."system_abbreviations"."full") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "cf"."abbreviations" ADD CONSTRAINT "abbreviations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- ===================================================================================================
-- ABBREV-DICT (FR-025, FR-050, Q-AD1) — feat-abbrev-dict. Từ điển viết tắt hệ thống + workspace.
--
--  * cf.system_abbreviations: dùng chung mọi workspace, KHÔNG có workspace_id và KHÔNG RLS (như core.feature_flags,
--    check-rls.ts SYSTEM_TABLES). cf_app/cf_worker chỉ SELECT; nội dung do migration này seed (docs/10 §9: không seed
--    dữ liệu khách). Muốn đổi bộ seed → migration mới (không có đường ghi từ ứng dụng).
--  * cf.abbreviations: của workspace, RLS. SELECT: thành viên đang hoạt động (hoặc ngữ cảnh không người dùng:
--    withWorkspace/withJob). INSERT/UPDATE/DELETE: Owner hoặc hệ thống của đúng workspace; Staff và withWorkspace trần
--    chỉ đọc. Cột định danh (workspace_id, lang) không nằm trong GRANT UPDATE. Mỗi lệnh đúng MỘT policy permissive.
--  * Mục của workspace đè mục hệ thống cùng (lang, short) ở tầng truy vấn (loadAbbreviationEntries), không ở DB.
--
-- TRIỂN KHAI: migrate trước; chưa có nơi dùng trong pipeline (chờ nối PIPE-NORMALIZE-LANG) nên không cần phối hợp worker.
-- Đường lùi: DROP TABLE cf.abbreviations, cf.system_abbreviations; và lùi check-rls.ts (mất mục workspace đã nhập).
-- ===================================================================================================
ALTER TABLE cf.abbreviations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON cf.system_abbreviations TO cf_app;
--> statement-breakpoint
GRANT SELECT, DELETE ON cf.abbreviations TO cf_app;
--> statement-breakpoint
GRANT INSERT (id, workspace_id, short, full, lang) ON cf.abbreviations TO cf_app;
--> statement-breakpoint
GRANT UPDATE (short, full, updated_at) ON cf.abbreviations TO cf_app;
--> statement-breakpoint
CREATE POLICY abbreviations_select ON cf.abbreviations FOR SELECT
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member()))
  );
--> statement-breakpoint
CREATE POLICY abbreviations_insert ON cf.abbreviations FOR INSERT
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY abbreviations_update ON cf.abbreviations FOR UPDATE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  )
  WITH CHECK (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
CREATE POLICY abbreviations_delete ON cf.abbreviations FOR DELETE
  USING (
    workspace_id = (SELECT core.current_workspace_id())
    AND ((SELECT core.is_workspace_owner()) OR (SELECT core.is_system_context()))
  );
--> statement-breakpoint
-- Seed hệ thống: teencode/viết tắt phổ biến trong bình luận bán hàng. Chỉ mục KHÔNG mơ hồ; chữ "ship" không có ở đây
-- (không phải viết tắt). Danh sách để chủ dự án duyệt/bổ sung bằng migration mới.
INSERT INTO cf.system_abbreviations (short, full, lang) VALUES
  ('ib', 'inbox', 'vi'), ('sz', 'size', 'vi'), ('dc', 'được', 'vi'), ('đc', 'được', 'vi'),
  ('k', 'không', 'vi'), ('ko', 'không', 'vi'), ('hok', 'không', 'vi'), ('khum', 'không', 'vi'),
  ('kh', 'khách hàng', 'vi'), ('bn', 'bao nhiêu', 'vi'), ('bnh', 'bao nhiêu', 'vi'), ('bh', 'bao giờ', 'vi'),
  ('sp', 'sản phẩm', 'vi'), ('j', 'gì', 'vi'), ('z', 'vậy', 'vi'), ('vs', 'với', 'vi'), ('r', 'rồi', 'vi'),
  ('mn', 'mọi người', 'vi'), ('mng', 'mọi người', 'vi'), ('ae', 'anh em', 'vi'), ('nt', 'nhắn tin', 'vi'),
  ('tn', 'tin nhắn', 'vi'), ('cmt', 'bình luận', 'vi'), ('dt', 'điện thoại', 'vi'), ('đt', 'điện thoại', 'vi'),
  ('sdt', 'số điện thoại', 'vi'), ('tk', 'tài khoản', 'vi'), ('stk', 'số tài khoản', 'vi'),
  ('ck', 'chuyển khoản', 'vi'), ('tt', 'thanh toán', 'vi'), ('ntn', 'như thế nào', 'vi'),
  ('bt', 'bình thường', 'vi'), ('xl', 'xin lỗi', 'vi'), ('cx', 'cũng', 'vi'), ('wa', 'quá', 'vi'),
  ('lun', 'luôn', 'vi'), ('dg', 'đang', 'vi'), ('đg', 'đang', 'vi'), ('mk', 'mình', 'vi'),
  ('hn', 'Hà Nội', 'vi'), ('sg', 'Sài Gòn', 'vi'), ('hcm', 'Hồ Chí Minh', 'vi'),
  ('pls', 'please', 'en'), ('plz', 'please', 'en'), ('thx', 'thanks', 'en'), ('ty', 'thank you', 'en'),
  ('u', 'you', 'en'), ('ur', 'your', 'en'), ('msg', 'message', 'en'), ('dm', 'direct message', 'en'),
  ('sz', 'size', 'en'), ('qty', 'quantity', 'en'), ('btw', 'by the way', 'en'),
  ('asap', 'as soon as possible', 'en'), ('idk', 'I don''t know', 'en'), ('tmrw', 'tomorrow', 'en');
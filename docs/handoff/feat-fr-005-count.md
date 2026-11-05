# Bàn giao `feat/fr-005-count` (claude, làn a)

**Đã làm:** `countActionableComments` + `ACTIONABLE_COMMENT_STATUSES` (`packages/db/src/queries/inbox.ts`, export ở `runtime.ts`); `server/workspace-counts.ts` (N `withActor` song song); `lib/workspace-count.ts`; nhãn trong bộ chuyển + i18n `workspace.switcher.pending`; CSS `.ws-switch-count`; docs/05 FR-005 làm rõ. Không migration.

**Đã đọc + rút ra:** định nghĩa "cần xử lý" đã có ở docs/05; tab "Mới" = `new` + `processing`; `withActor` cần ngữ cảnh từng workspace nên không đếm gộp một truy vấn được.

**Còn lại:** kiểm tay; nếu người dùng có rất nhiều workspace → đề xuất hàm DB gộp (cần migration, làn B). Test `staging-migrate.int` có thể đỏ khi nhiều làn dùng chung DB (không liên quan nhánh này).

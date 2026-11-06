# Handoff `feat-post-notes` (claude)

## Đã làm
POST-NOTES (FR-062/US-033, Q-PN1): migration 0045 (`cf.post_notes`, `cf.post_auto_overrides` + RLS Owner/hệ thống ghi), `packages/shared/src/post-notes.ts` (+test), `packages/db/src/queries/post-notes.ts`, kỳ vọng trong `check-rls.ts`, `tests/post-notes.int.test.ts`, docs (gap-matrix, MASTER, codemap, docs/10, Q-PN1, KT-PN).

## Đã đọc và rút ra
- Mẫu bảng Owner-ghi: `0044_size_charts.sql` + `queries/size-charts.ts` (policy `is_workspace_owner OR is_system_context`, GRANT INSERT/UPDATE theo cột).
- Worktree không có `.env` → `pnpm test:db`/`db:check-rls` không chạy được cục bộ (globalSetup đòi `TEST_DATABASE_URL`); chạy ở CI.
- Chưa có bảng `automation_settings` trong code → ghi đè theo bài làm bảng riêng.

## Còn lại
API + UI ghi chú/chế độ tự động trong chi tiết bài (cần Stitch); `DATA-PRIORITY` dùng `listActivePostNotes`; nối `effectiveAutoMode` vào cổng tự gửi khi có `automation_settings`.

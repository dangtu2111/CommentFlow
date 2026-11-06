# Bàn giao `feat-kb-testset` (claude, làn d)

## Đã làm
- Lõi `packages/ai/src/try/test-set.ts` (Zod, `runTestSet`, cổng) + test; web: `server/kb-testset.ts`, `lib/kb-testset-form.ts`, trang `/app/kb-testset`, menu, i18n vi+en. Q-KTS1.

## Đã đọc và rút ra
- `runTryPipeline` trả `decision.action` ∈ answer/clarify/redirect/handoff; mock "ship về Hà Nội" cho `redirect` (thiếu một phần nguồn). `KnowledgeRunner` dùng chung với ô Thử AI (cờ `TRY_AI_KB_REAL`).
- Worktree cần `pnpm install --frozen-lockfile` trước khi chạy vitest.

## Còn lại
- `KB-TESTSET-PERSIST` (làn b, migration): lưu bộ câu theo workspace + kết quả lần chạy cuối gắn `kb_versions`; chặn/cảnh báo ở nút Xuất bản (`KB-PUBLISH-LABEL-DEMOTE`).
- Hạn mức lượt chạy bền (Redis/DB) thay bộ nhớ tiến trình.

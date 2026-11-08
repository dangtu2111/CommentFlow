# Bàn giao `feat/kb-policy-sync` (08/11/2026, Claude Code)

PR #280 (lát 1–4). Kế hoạch đã duyệt: `docs/plans/feat-kb-policy-sync.md`.

## Đã làm
- **Lát 1** thuần (`packages/ai/src/kb-sync/`): `splitSections`, `buildPolicyDocuments`, `classifyTopic`, `detectConflicts` (số + đơn vị, khác NGUỒN gốc `originKey`), `conflictChunkOf`, `build{Faq,Shop,Product}Documents`; mã chủ đề cố định `KbTopic` ở `packages/shared/src/kb-topics.ts`.
- **Lát 2**: job `kb-sync` (`apps/worker/src/jobs/kb-sync.ts`, `runKbSync`): một giao dịch `withJob` + khóa chung `kb-publish`, embedding thật theo model ở DB (thiếu → `CONFIG_INVALID`, không ghi gì), `metadata.topic`; web `createKbSyncRequester` xếp job khi lưu chính sách/FAQ/shop (gộp 10 giây/workspace qua `kbSyncEnqueueOptions`).
- **Lát 3**: `markDraftConflicts` chạy trong `runKbPublish` (chỉ khi xuất bản bản nháp) → `kb_chunks.metadata.conflict_group/conflict_values`; trang `/app/kb-publish` hiện cảnh báo (2 câu + nguồn) và banner "Chưa xuất bản kiến thức".
- **Lát 4**: `policy_conflict` trong `decideAction` (rủi ro thắng); `run-pipeline` tính `policyConflict` từ `TryCandidate.conflictTopic` + chủ đề mịn của ý hỏi (`conflictTopicsOfAsk`); `searchKbChunks` trả `metadata`.

## Điều rút ra (đừng đọc lại)
- Bảng `products` KHÔNG có cột mô tả → Q-KSD1: mô tả = tên + mã + tùy chọn biến thể.
- `kb_chunks.metadata` jsonb có sẵn từ 0033, cf_app có GRANT UPDATE, publish sao chép nguyên `metadata` → không cần migration.
- Mỗi loại nguồn đồng bộ có MỘT `kb_sources` với `external_key = 'sync:<loại>'`.

## Còn lại (PR sau)
1. Xếp job `kb-sync` khi SẢN PHẨM đổi (nhập tay + job Shopify sync) và cân nhắc quét định kỳ.
2. Banner "Chưa xuất bản kiến thức" ở trang Tổng quan KB và ô Thử AI (hiện chỉ ở trang Xuất bản).
3. **EVAL đường production** (EVAL-RELIABILITY mục 3): seed shop file vào workspace `[EVAL]` (id cố định `EVAL_WORKSPACE`) gồm products + variants + policy_items + faq_items → `runKbSync` → xuất bản tự động (`createKbVersionFromChunks`, `published_by` cho phép NULL) → runner dùng `loadWorkspaceKnowledge` + embedder bge-m3; báo cáo ghi embedder + `kb_version`; ≥ 3 lượt mỗi bên, mean + min/max, cổng theo lượt tệ nhất, liệt kê mẫu chập chờn; extract temperature 0 + seed.
4. Hướng dẫn Owner bấm Xuất bản cho Shop Thử 2 (workspace `e8f9e1e3-a805-491a-81d5-0612fec8d6a2`) sau khi nhập chính sách.

## Tự kiểm
Diff chạm ghi `kb_chunks` qua `withJob` (không đổi RLS, không migration). Tự kiểm, chưa có kiểm chứng độc lập — chủ dự án kiểm chéo trước khi merge.

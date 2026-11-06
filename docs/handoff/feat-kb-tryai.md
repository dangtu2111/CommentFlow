# Bàn giao — nhánh `feat-kb-tryai`

Cập nhật: 2026-11-06 · Mục gap matrix: KB-TRYAI · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-kb-tryai.md` · Quyết định: Q-KTA1

## Đã làm
- `packages/ai/src/try/kb-try-knowledge.ts` (+ test): `createKbTryKnowledge({searcher, embedder, base})` — `searchKb` nhúng câu hỏi, gọi `KbSearcher` (bọc `searchKbChunks`), điểm = `rrfRelevance`, loại đoạn nghi cài lệnh, suy chủ đề bằng `topicOf`.
- `try-pipeline.ts`: `TryKnowledge.searchKb(query, {lang, productIds})`; export `topicOf`.
- Web: `server/try-ai-knowledge.ts` (cờ `TRY_AI_KB_REAL` mặc định TẮT, `createKnowledgeRunner` chạy trong `withActor`, phiên bản mới nhất, rơi về mẫu khi thiếu), `server/try-ai.ts` (`knowledgeRunner`, kết quả có `knowledge: demo|kb`), `actions.ts` truyền `userId`, form hiện dòng nguồn; i18n `tryAi.knowledge.*` vi+en.
- Không migration.

## Đã đọc và rút ra
- Ô Thử AI đã hiện đoạn + điểm từ AI-TRY-BOX-UI; việc này chỉ thay nguồn mock bằng KB thật sau cờ.
- Chưa có worker điền `embedding` (`KB-CHUNKING`) → nhánh vector rỗng; embedding truy vấn là fixture.

## Còn lại
- `TRY-AI-REAL`: sản phẩm thật qua `TryKnowledge`, LLM thật, `brand_voice` thật, ghi `retrieval_logs` (cần ghi từ job, FR-134), `/kb/retrieval-logs`, test tích hợp DB trên CI, E2E.

# Kế hoạch `feat-kb-embed-col` — HNSW cho `kb_chunks.embedding` + chỉ mục `embedding_model`

## Việc

Mã gap matrix: `KB-EMBED-COL` · Spec: FR-133, FR-139 (docs/10 §3 `kb_chunks`, "Kiểu vector").

**Tóm tắt:** Cột `embedding halfvec(1024)` và `embedding_model` đã có từ KB-SCHEMA (0033). Còn thiếu hai chỉ mục: HNSW (chỉ mục tìm vector gần đúng, nhanh khi nhiều đoạn) cho `embedding`, và B-tree `(workspace_id, embedding_model)` để job tạo lại embedding (GĐ5) tìm nhanh đoạn dùng mô hình cũ. Rủi ro: HNSW lọc workspace sau khi quét có thể trả thiếu kết quả → bật `hnsw.iterative_scan` trong truy vấn tìm (pgvector 0.8.7 ở CI/dev).

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-KEC1.

## Tiêu chí nghiệm thu

1. Migration 0042 tạo `kb_chunks_embedding_hnsw_idx` (hnsw, `halfvec_cosine_ops`, một phần: đã xuất bản, có vector, không nghi cài lệnh) hợp lệ — `kb-embed-col.int.test.ts`.
2. Tạo `kb_chunks_workspace_embedding_model_idx (workspace_id, embedding_model)` hợp lệ — cùng test.
3. Khi ép dùng chỉ mục (`enable_seqscan=off`), truy vấn vector dùng HNSW — cùng test (EXPLAIN).
4. `searchKbChunks` trả đủ kết quả của workspace dù workspace khác có nhiều vector gần hơn (iterative scan) — cùng test.
5. Migration từ chối khi pgvector < 0.8 — đọc SQL (khối DO).
6. Tìm kiếm cũ (`kb-search.int.test.ts`), RLS, `check-rls` vẫn xanh.

## File sẽ đọc

`migrations/0033`, `0038` (mẫu), `queries/kb-search.ts`, `schema/cf/kb.ts`, `tests/kb-search.int.test.ts` (helper) — đã đọc.

## File sẽ sửa / tạo

- `packages/db/migrations/0042_kb_embed_col.sql` (+ journal, snapshot) — hai chỉ mục.
- `packages/db/src/schema/cf/kb.ts` — khai báo chỉ mục.
- `packages/db/src/queries/kb-search.ts` — bật `hnsw.iterative_scan = strict_order` cục bộ giao dịch.
- `packages/db/tests/kb-embed-col.int.test.ts` — test mới.
- docs: 10_Database_Design (§ HNSW), gap-matrix, MASTER, codemap, QUYET_DINH_CHO_DUYET, KIEM_TRA_TAY, handoff.

## Migration

0042: HNSW một phần (m=16, ef_construction=64) và B-tree `embedding_model`. Không đổi dữ liệu/RLS/quyền. Lùi: `DROP INDEX cf.kb_chunks_embedding_hnsw_idx, cf.kb_chunks_workspace_embedding_model_idx;`.

## Test viết trước

`kb-embed-col.int.test.ts` (đỏ trước khi có migration).

## Lệnh test phạm vi hẹp

`CF_LANE=b pnpm test:db` (kb-embed-col, kb-search), `pnpm --filter @flow/db typecheck`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` một lần (migration + chỉ mục + truy vấn).

## Rủi ro / câu hỏi cho chủ dự án

Job tạo lại embedding để GĐ5 (không làm ở đây). Tạo HNSW khóa bảng ngắn khi bảng lớn → hiện bảng nhỏ; lúc lớn dùng CONCURRENTLY ngoài migration.

## Đề xuất thay đổi

Cập nhật docs/10 mô tả chỉ mục một phần + iterative scan (ghi vào Q-KEC1).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc Q-KEC1).

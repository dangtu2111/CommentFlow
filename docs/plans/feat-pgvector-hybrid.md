# Kế hoạch `feat-pgvector-hybrid` — PGVECTOR-HYBRID

## Việc

Mã gap matrix: `PGVECTOR-HYBRID` · Spec: docs/10 §3.4/§5 (kb_chunks, tìm lai), FR-055/057/133/139.

**Tóm tắt:** Tìm lai (vector + toàn văn + trigram, trộn RRF) và chỉ mục HNSW đã có (0038, 0042). Việc này bổ sung phần còn thiếu: (1) job **tạo lại embedding** khi đổi mô hình (embedder mock, cờ TẮT); (2) nhánh vector của `searchKbChunks` chỉ so với đoạn **cùng mô hình** (vector khác mô hình không so được — nếu không, lúc đang tạo lại sẽ ra kết quả rác); (3) test độ chính xác lai ≥ từng nhánh đơn bằng fixture. Rủi ro: ghi đè vector đoạn đã xuất bản (chỉ cột dẫn xuất, nội dung không đổi).

## Điểm chưa rõ

Không có. (Tự chọn khuyến nghị an toàn, ghi Q-PVH1: không thêm migration; quyền UPDATE `embedding`/`embedding_model` cho hệ thống đã có từ 0033, chỉ mục `(workspace_id, embedding_model)` đã có từ 0042.)

## Tiêu chí nghiệm thu

1. Job tạo lại embedding chỉ chạm đoạn có `embedding_model` khác mô hình đích (kể cả NULL), theo lô, chạy lại an toàn (lần 2 = 0 đoạn) — kiểm bằng unit `kb-reembed.test.ts` + int `kb-reembed.int.test.ts`.
2. Ghi lại vector bị từ chối khi nội dung đoạn đã đổi giữa lúc đọc và ghi (`content_hash` lệch) — kiểm bằng int test.
3. Không đổi `content`, `content_hash`, `tsv`, `version_id`, `is_draft`; không đụng workspace khác (RLS) — int test chéo workspace.
4. `searchKbChunks` với `embeddingModel` chỉ trả đoạn vector cùng mô hình; nhánh toàn văn/trigram không lọc mô hình — int test.
5. Độ chính xác: trên bộ fixture, recall@1 của lai đúng mọi truy vấn và lớn hơn từng nhánh đơn (vector-only, text-only) trên cả bộ — int test `kb-hybrid-accuracy.int.test.ts`.
6. Cờ `KB_REEMBED_ENABLED` mặc định TẮT: tắt thì không đăng ký hàng đợi `kb-reembed` — test config.
7. Lệnh công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test phạm vi, coverage gói đổi, test:db, check-rls.

## File sẽ đọc

Đã đọc: `packages/db/src/queries/{kb-chunks,kb-search}.ts`, `packages/ai/src/kb-indexing.ts`, `packages/db/migrations/0033,0042`, `apps/worker/src/{main.ts,jobs/kb-publish.ts,jobs/run-job.ts,config.ts,queue/definitions.ts}`.

## File sẽ sửa / tạo

- `packages/shared/src/kb-reembed.ts` (+test, +export index): tên hàng đợi, schema job.
- `packages/db/src/queries/kb-reembed.ts` (+export): liệt kê/ghi lại embedding (chỉ `withJob`).
- `packages/db/src/queries/kb-search.ts`: tham số `embeddingModel`.
- `packages/ai/src/kb-reembed/` (+test): `reembedWorkspaceChunks` (ops tiêm vào).
- `apps/worker/src/jobs/kb-reembed.ts` (+test), `queue/definitions.ts`, `config.ts`, `main.ts`; `env.example`.
- Test int: `packages/db/tests/kb-reembed.int.test.ts`, `kb-hybrid-accuracy.int.test.ts`.
- Docs: codemap.d, quyet-dinh/q-pvh1.md, CBCC, KT, gap-matrix/MASTER, handoff, docs/10 (ghi chú).

## Migration

Không có (Q-PVH1).

## Test viết trước

Unit orchestrator (lô, idempotent, model đích, lỗi số chiều, trần lô), schema job; int DB như tiêu chí 1–5.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-reembed` · `pnpm --filter @flow/worker exec vitest run src/jobs/kb-reembed.test.ts` · `CF_LANE=b pnpm test:db`.

## Cần kiểm chứng độc lập không?

verifier-db một lần (ghi vào bảng có RLS bằng `withJob`, truy vấn tìm kiếm). Không chạm auth/PII/thanh toán.

## Rủi ro / câu hỏi cho chủ dự án

Embedder thật (LiteLLM) chưa có → job chỉ chạy với mock khi bật cờ; không bật ở staging/production cho đến `KB-EMBED-LITELLM`.

## Đề xuất thay đổi

Không đổi spec; chỉ thêm ghi chú docs/10.

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

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi Q-PVH1).

# Bàn giao `feat-kb-injection-guard` (claude, làn d)

## Đã làm
KB-INJECTION-GUARD (FR-164, QKI1): `packages/ai/src/injection/injection-scan.ts` (+ test, property-based); nối vào `kb-indexing.ts` (cờ `injection*` trong `ChunkRow`, tham số `allowedDomains`), `queries/kb-chunks.ts` (`upsertDraftChunks` ghi cờ khi hash đổi, giữ cờ đã duyệt khi không đổi), `retrieve/sources.ts` + `retrieve.ts` (`quarantined`), `draft/draft-prompt.ts` (`escapeSource` vô hiệu mọi `<`/`>`). Không migration.

## Đã đọc và rút ra
- `kb_chunks.injection_suspected/injection_reason` có sẵn, `cf_app` có UPDATE (0033); `searchKbChunks` đã lọc `NOT injection_suspected` (kb-search.ts:76).
- `foldText` (shared/products.ts) gộp cả xuống dòng → quét dấu hiệu theo dòng phải làm trên văn bản chưa fold.

## Còn lại
`KB-INJECTION-REVIEW` (route `GET /kb/review/injection`, approve/reject + UI), chặn xuất bản tự động ở `KB-PUBLISH`, trang crawl luôn qua duyệt (`POLICY-URL-IMPORT`), `allowedDomains` theo workspace, nối vào `KB-INDEX-JOB`, ghi `quarantined` vào `retrieval_logs`.

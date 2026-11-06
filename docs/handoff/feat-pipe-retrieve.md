# Bàn giao `feat-pipe-retrieve` (claude, làn d)

## Đã làm
- `packages/ai/src/retrieve/`: `retrieveKnowledge` (Khiếu nại mọi vị trí / spam nhãn chính → `skipped`; còn lại chạy `routeQuery` + `executeRoute`), `sources.ts` (nguồn biến thể từ DB; nguồn kiến thức: RRF → 0..1, ngưỡng 0,25, ưu tiên sản phẩm gắn bài, trần 3.000 token), `kb-searcher.ts` (cổng + bản DB bọc `searchKbChunks`).
- Test viết trước (đỏ vì thiếu module) rồi code; property-based bằng fast-check; ngưỡng nhánh `src/retrieve/*.ts` ≥ 95% trong `vitest.config.ts`.
- Q-RT1, KT-RT, gap matrix/MASTER/codemap đã cập nhật.

## Đã đọc và rút ra
- `route/*` (`routeQuery`, `executeRoute`, `lookupVariantsForRoute`): dùng nguyên, không sửa.
- `searchKbChunks` trả điểm RRF (tối đa 3/61), không phải 0..1 → đổi ở `rrfRelevance`.
- `DraftSource` (`draft-prompt.ts`) là đầu ra của retrieve; drafter còn lọc thêm ngưỡng 0,35 của nó.
- Vitest 5: `mockRejectedValue` sau `mockReset` làm test đỏ giả; dùng `mockImplementationOnce(async () => { throw … })`.

## Còn lại (việc khác)
1. Nối pipeline (job `process`): cấp `resolvedProductIds`, `searchQuery` (`rewriteQuery`), `versionId`; truyền `sources` cho `decideAction`/drafter.
2. Rerank, ghi chú bài (cần bảng), câu mẫu shop §5.4, `resolveProducts` (bí danh → `PRODUCT-ALIAS`), ghi `retrieval_logs` — cần bảng, làn b.
3. Embedder thật (`docs/CAN_BAN_CUNG_CAP.md` §2g); hiệu chỉnh ngưỡng bằng AI-EVAL; thống nhất ngưỡng 0,25 (retrieve) với 0,35 (drafter).

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/retrieve
pnpm --filter @flow/ai test:coverage
```

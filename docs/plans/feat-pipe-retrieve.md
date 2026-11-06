# Kế hoạch `feat-pipe-retrieve` — Tìm kiến thức cho nhãn cần trả lời (FR-028)

## Việc

Mã gap matrix: `PIPE-RETRIEVE` · Spec: FR-028, FR-136, FR-145 (`docs/05`), `docs/09` §4 (bước `retrieve`), NFR-C6.

**Tóm tắt:** Thêm vào `packages/ai` bước `retrieve` (nối `route` → tra biến thể SQL và/hoặc tìm kiến thức hybrid → gói **nguồn** cho bước soạn). Khiếu nại (ở bất kỳ vị trí nào) và spam thì **không tìm, không soạn**. Giá/tồn lấy từ `product_variants` (không từ vector); kiến thức lấy qua `searchKbChunks` có sẵn với embedder mock; điểm RRF đổi sang 0..1, lọc ngưỡng liên quan, xếp ưu tiên (đoạn của sản phẩm gắn bài trước kiến thức chung) và cắt trần ~3.000 token. Rủi ro: ngưỡng/trọng số là khởi điểm, hiệu chuẩn ở `AI-EVAL-*`; rerank, ghi chú bài, câu mẫu shop (§5.4), `retrieval_logs`, `resolveProducts` chưa làm (cần bảng/việc riêng).

## Điểm chưa rõ

Không có. Tự quyết ở Q-RT1 (`QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Nhãn `complaint` ở bất kỳ vị trí, hoặc `spam` là nhãn chính → `skipped`, **không gọi** SQL/embedder/tìm kiến thức — kiểm: `retrieve.test.ts` (FR-028, FR-145).
2. Nhãn cần trả lời → chạy đúng nhánh theo `routeQuery`: `sql` không gọi embedder/tìm kiến thức; `both` gọi cả hai; `hybrid` chỉ tìm kiến thức — kiểm: `retrieve.test.ts` (FR-028, FR-136).
3. Nguồn biến thể sinh từ DB (giá `250.000đ`, tồn kho; tồn `null` → "chưa rõ"), không từ kiến thức; id `variant:<id>`, relevance 1 — kiểm: `sources.test.ts` (FR-028).
4. Điểm RRF → 0..1 (ba nhánh hạng 1 = 1), lọc dưới `minRelevance`, xếp: đoạn của sản phẩm gắn bài trước đoạn chung rồi theo điểm; cắt trần token, đánh dấu `truncated` — kiểm: `sources.test.ts` (FR-028, FR-057).
5. Câu tìm rỗng → không gọi embedder; lỗi embedder/tìm/tra DB được ném ra, không nuốt — kiểm: `retrieve.test.ts`.
6. `createDbKbSearcher` chuyển đúng tham số (workspace, phiên bản, ngôn ngữ, vector, sản phẩm) cho `searchKbChunks` — kiểm: `kb-searcher.test.ts` (mock `@flow/db/runtime`).
7. Thuộc tính (fast-check): `sql` ⇒ không bao giờ có nguồn kiến thức; tổng token nguồn ≤ trần; mọi `relevance` ∈ [0,1] — kiểm: `sources.test.ts`/`retrieve.test.ts` "property-based".
8. Ngưỡng coverage `packages/ai` giữ; cổng chung xanh — kiểm: `pnpm --filter @flow/ai test:coverage`, lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc

Đã đọc: `docs/09` §4; `docs/05` FR-028/136/145; `packages/ai/src/route/{route,execute-route,sql-lookup}.ts`; `packages/ai/src/embedding/*`; `packages/ai/src/draft/draft-prompt.ts` (`DraftSource`); `packages/db/src/queries/kb-search.ts` (`searchKbChunks`, `KbSearchHit`); `packages/ai/vitest.config.ts`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/retrieve/retrieve.ts` (+ `retrieve.test.ts`), `sources.ts` (+ `sources.test.ts`), `kb-searcher.ts` (+ `kb-searcher.test.ts`).
- Sửa `packages/ai/src/index.ts` (xuất), `packages/ai/vitest.config.ts` (ngưỡng nhánh `src/retrieve/*.ts`), `docs/testing/KIEM_TRA_TAY.md` (KT-RT), `docs/plans/{MASTER,QUYET_DINH_CHO_DUYET}.md`, `docs/gap-matrix.md`, `docs/codemap.md` (dòng riêng), `docs/handoff/feat-pipe-retrieve.md`.

## Migration

Không có (ghi `retrieval_logs`, ghi chú bài, bí danh sản phẩm cần bảng → làn b; ghi vào gap matrix).

## Test viết trước

`retrieve.test.ts`, `sources.test.ts`, `kb-searcher.test.ts` viết trước, chạy đỏ (module chưa có) rồi mới viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/retrieve` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng tự gửi/PII/migration; bản nối DB chỉ bọc truy vấn có sẵn đã lọc `workspace_id`; nguồn là dữ liệu shop tự nhập, không có PII khách).

## Rủi ro / câu hỏi cho chủ dự án

Ngưỡng liên quan 0,25 và ước lượng token (ký tự/3) là heuristic. Không cần tài nguyên ngoài (embedder là bản fixture, đã có mục `CAN_BAN_CUNG_CAP.md` §2g).

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (không thêm thư viện; cổng `KbSearcher` có ≥ 2 nơi dùng: bản DB và fixture test/`KB-TRYAI`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định đã có trong FR-028/136 + Q-RT1).

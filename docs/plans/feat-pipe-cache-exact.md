# Kế hoạch `feat-pipe-cache-exact` — PIPE-CACHE-EXACT (cache khớp chính xác)

## Việc

Mã gap matrix: `PIPE-CACHE-EXACT` · Spec: FR-026, FR-135, docs/09 §4 (`cacheLookup`), docs/10 §5.3.

**Tóm tắt:** Dựng bước `cacheLookup` khớp chính xác: câu hỏi đã chuẩn hóa + bài + phiên bản kiến thức + workspace → nếu đã có câu trả lời cùng khóa thì dùng lại, đỡ gọi AI. Khóa luôn có `workspace_id` (không lẫn giữa shop); giá trị cache lưu kèm `product_revs` và bị coi là trượt nếu `products.rev` đã đổi (không bao giờ trả giá cũ). Rủi ro chính: trả sai giá/sai shop — chặn bằng khóa + so `rev` ở mỗi lần đọc. Chưa có bản Redis thật (cần nối ở PIPE-ORCHESTRATOR) nên làm sau interface `ExactCacheStore` + bản bộ nhớ để test.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-PCX1.

## Tiêu chí nghiệm thu

1. Khóa có dạng `cf:{workspace_id}:cache:exact:{kb_version}:{post|-}:{sha256(câu chuẩn hóa + lang)}`; hai workspace/bài/kb_version/ngôn ngữ khác nhau → khóa khác; không chứa văn bản thô — `exact-cache.test.ts`.
2. Thiếu/sai `workspace_id` → từ chối (không dựng khóa không có workspace) — cùng test.
3. Lần đọc: trúng khi cùng khóa và `product_revs` khớp; trượt (`stale`) và xóa khóa khi một sản phẩm lệch rev hoặc đã biến mất; đọc rev hiện tại chỉ khi cache có sản phẩm — cùng test.
4. Cờ `cf.cache.answers` tắt → không đọc, không ghi; giá trị hỏng/sai schema → `corrupt` (miss), không ném — cùng test.
5. Ghi cache chỉ nhận câu trả lời đã qua cổng (`cacheable`): không cache khi chuyển người/khiếu nại — cùng test.
6. `getCurrentKbVersion` trả số phiên bản lớn nhất của đúng workspace (0 khi chưa xuất bản), không lộ workspace khác — `kb-version.int.test.ts` (CI).
7. Coverage `packages/ai` giữ ngưỡng; lint, typecheck, depcruise, check:plans, test:trace xanh.

## File sẽ đọc

`packages/ai/src/index.ts`, `retrieve/retrieve.ts` (kiểu), `variation/variation.ts` (băm), `shared/src/search.ts` (`isProductCacheStale`), `db/src/queries/kb-search.ts` (mẫu), `db/tests/kb-embed-col.int.test.ts` (mẫu) — đã đọc.

## File sẽ sửa / tạo

- `packages/ai/src/cache/exact-cache.ts` (+ `.test.ts`) — khóa, đọc/ghi cache, store interface + bản bộ nhớ.
- `packages/ai/src/index.ts` — export.
- `packages/db/src/queries/kb-version.ts` (+ `tests/kb-version.int.test.ts`) — `getCurrentKbVersion`.
- docs: gap-matrix, MASTER, codemap (dòng riêng), handoff, QUYET_DINH, CAN_BAN_CUNG_CAP, KIEM_TRA_TAY, docs/09 §4 (ghi chú khóa).

## Migration

Không có (đọc `kb_versions` sẵn có; không cần cột/bảng mới).

## Test viết trước

`exact-cache.test.ts` (đỏ trước vì chưa có module): từng tiêu chí 1–5.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/cache` · `pnpm --filter @flow/ai test:coverage` · `CF_LANE=b pnpm test:db`.

## Cần kiểm chứng độc lập không?

Có, một lần: `verifier-security` (khóa chứa workspace_id, không lộ chéo workspace, không trả giá cũ) + `verifier-db` (truy vấn `kb_versions`).

## Rủi ro / câu hỏi cho chủ dự án

Bản Redis thật + xóa cache theo bài khi webhook giá (docs/09 §6) nối ở bước điều phối pipeline; rev lệch đã đủ chặn giá cũ.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Interface `ExactCacheStore` khi mới có một bản thật: ngoại lệ "connector/saas-core" không áp dụng; cần để test không phụ thuộc Redis và vì có bản bộ nhớ (test) + bản Redis (sau) = 2 nơi dùng. Không thêm thư viện.

**Trạng thái duyệt:** Đã duyệt (tự duyệt — mọi quyết định có trong spec/Q-PCX1).

## Checklist plan

- [x] Tiêu chí nghiệm thu kiểm được
- [x] Không còn điểm chưa rõ

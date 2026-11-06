# Kế hoạch `feat-semantic-cache` — Semantic cache đầy đủ (qua interface, mock)

## Việc

Mã gap matrix: `SEMANTIC-CACHE` · Spec: FR-026 (docs/05), docs/09 §4 `cacheLookup`.

**Tóm tắt:** Dựng bộ nhớ đệm theo ý nghĩa (semantic cache: câu hỏi diễn đạt khác nhưng đủ giống thì dùng lại câu trả lời cũ) thành logic thuần của chính repo, đứng sau interface `SemanticCacheStore` (Redis Stack/LiteLLM nối sau) và dùng `Embedder` có sẵn (mock). Khóa chứa `workspace_id`, bài, `kb_version`; so ngưỡng độ giống; mọi lần đọc so `product_revs` với `products.rev` hiện tại nên không trả giá cũ. Cờ mặc định TẮT. Rủi ro: trả nhầm câu của câu hỏi gần giống nhưng khác số (size 38 vs 39) → có chốt chặn số.

## Điểm chưa rõ

Không có (xem Q-SC1).

## Tiêu chí nghiệm thu

1. Namespace/khóa chứa `workspace_id` + bài + `kb_version`; hai shop/bài/phiên không chung — test + property-based.
2. Độ giống ≥ ngưỡng (mặc định 0,92) mới trúng; dưới ngưỡng → miss `below_threshold`; ngưỡng ngoài (0,1] → `VALIDATION_FAILED` — test, ca biên đúng ngưỡng.
3. Lệch `products.rev` (đổi giá/xóa sản phẩm) → miss `stale` + xóa mục; câu có số tiền mà không có `product_revs` → không ghi — test.
4. Câu hỏi có số khác với câu đã lưu (size/số lượng) hoặc khác ngôn ngữ → không trúng — test.
5. Câu có SĐT/email hoặc `cacheable=false` → không ghi; mục hỏng → miss `corrupt` + xóa — test.
6. Cờ tắt → không gọi embed/store — test. Cosine không đổi theo tỉ lệ vector, đối xứng — property-based.
7. Bộ nhớ trong mock: TTL, tìm gần nhất trong đúng namespace — test.
8. Coverage `@flow/ai` giữ ngưỡng — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`packages/ai/src/cache/exact-cache.ts`, `semantic-cache.ts`, `embedding/embedder.ts`, `fixture-embedder.ts`, `guard-money.ts` (extractClaims) — đã đọc.

## File sẽ sửa / tạo

- tạo `packages/ai/src/cache/semantic-lookup.ts` (+ `.test.ts`); sửa `packages/ai/src/cache/index.ts`
- docs mới bằng file riêng: `docs/codemap.d/`, `docs/plans/quyet-dinh/q-sc1.md`, `docs/can-ban-cung-cap.d/`, `docs/testing/kiem-tra-tay.d/kt-sc.md` + `tt-sc.md`; sửa dòng của mình ở gap-matrix/MASTER; handoff.

## Migration

Không có. Lưu trữ thật (Redis Stack vector) chưa nối; nếu cần bảng → ghi gap cho làn b.

## Test viết trước

`semantic-lookup.test.ts` (đỏ trước khi có mã).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/cache`

## Cần kiểm chứng độc lập không?

Có, một lần `verifier-security` (cách ly workspace, không rò PII, không trả giá cũ).

## Rủi ro / câu hỏi cho chủ dự án

Cosine của mock trigram không thay độ chính xác ngữ nghĩa thật; ngưỡng cần chỉnh theo dữ liệu thật khi bật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Interface `SemanticCacheStore`/`Embedder`: ngoại lệ connector/hạ tầng được AGENTS.md cho phép (Redis thật + mock = 2 nơi dùng). Không thư viện mới (`fast-check` đã có).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/Q-PCS1/Q-SC1).

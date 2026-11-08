# Kế hoạch `feat/product-match-hybrid` — Khớp sản phẩm LAI (trigram + vector tên)

Mã gap matrix: `PRODUCT-MATCH-HYBRID` (nhóm 1b) · Tiếp theo #287 (guard nghĩa, đã merge).

**Tóm tắt:** Khớp sản phẩm production chỉ dùng trigram nên khách gõ lệch chữ ("áo sơ mi trắng" ↔ "Sơ mi nam màu trắng") không khớp. Việc này đưa vector tên sản phẩm (bge-m3, đã có cột `name_embedding`) vào quyết định chọn sản phẩm: điểm mỗi sản phẩm = lớn hơn của độ giống trigram và điểm từ cosine; margin top1–top2 và ngưỡng giữ nguyên. Đồng bộ kiến thức nay nhúng bù tên cho sản phẩm còn thiếu vector (trước đây không có đường nào tạo vector tên cho sản phẩm mới). Rủi ro thấp–vừa: ngưỡng cosine 0,62 là KHỞI ĐIỂM chưa hiệu chuẩn (cần đo khi có credit); vector chỉ làm tăng khả năng khớp, và thiếu embedder/lỗi embedding thì quay về trigram như cũ.

## Điểm chưa rõ

Không có (chủ dự án chốt thứ tự 08/11/2026; ngưỡng ghi vào quyết định, hiệu chuẩn sau).

## Tiêu chí nghiệm thu

1. `hybridProductScores`/`productScoreFromCosine`: cosine dưới ngưỡng → 0, đúng ngưỡng ↔ ngưỡng chọn; chỉ-vector vẫn có điểm; không đủ cả hai → không chọn — kiểm bằng: `packages/shared/src/search.test.ts`.
2. `findProductMatch` (DB thật): chữ không giống nhưng vector gần → chọn; vector xa → không; không vector → như cũ — kiểm bằng: `packages/db/tests/kb-search.int.test.ts`.
3. `createDbProductKnowledge`: có embedder → truyền vector + model; embedder lỗi → suy giảm về trigram, báo một lần; `loadWorkspaceKnowledge` truyền embedder đã qua kiểm lệch model — kiểm bằng: `db-product-knowledge.wiring.test.ts`, `workspace-knowledge.product-embed.test.ts`.
4. `runKbSync` nhúng bù tên sản phẩm thiếu/khác model (chỉ active, chỉ khi tên còn nguyên, không đổi `rev`) — kiểm bằng: `run-kb-sync.test.ts`, `kb-search.int.test.ts`.
5. (Chờ credit) đo trước/sau: tỷ lệ khớp sản phẩm trên bộ EVAL, hiệu chuẩn `PRODUCT_MIN_COSINE`.

## File sẽ đọc

`packages/db/src/queries/{kb-search,kb-sync}.ts`, `packages/shared/src/search.ts`, `packages/ai/src/try/{db-product-knowledge,workspace-knowledge}.ts`, `packages/ai/src/kb-sync/run-kb-sync.ts`, `packages/ai/src/kb-reembed/reembed-products.ts`.

## File sẽ sửa

Các file trên + `packages/db/src/runtime.ts` (export), tests tương ứng, `docs/gap-matrix.md`, quyết định `docs/plans/quyet-dinh/`.

## Migration

Không có (cột `name_embedding`, `name_embedding_model` đã có; trigger chặn lệch model vẫn áp dụng).

## Cần kiểm chứng độc lập không?

Không (không đổi auth/RLS/thanh toán/cổng tự gửi; ghi vector đi qua `withJob` + trigger sẵn có).

## Rủi ro / câu hỏi cho chủ dự án

Ngưỡng `PRODUCT_MIN_COSINE = 0,62` chưa hiệu chuẩn → ghi gap, đo khi có credit.

## Complexity tracking

Không có.

## Trạng thái duyệt

Đã duyệt (thứ tự việc của chủ dự án 08/11/2026).

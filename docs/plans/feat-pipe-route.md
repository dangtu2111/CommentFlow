# Kế hoạch `feat-pipe-route` — Định tuyến theo ý định (FR-136)

## Việc

Mã gap matrix: `PIPE-ROUTE` · Spec: FR-136 (`docs/05`), `docs/09` §4 (bước `route`, `retrieve`), `docs/10` `retrieval_logs.route`, NFR-C6.

**Tóm tắt:** Thêm vào `packages/ai` bước `route` (thuần, 0 chi phí): đọc object `extract` + danh sách sản phẩm đã nhận, trả nhánh `sql` / `both` / `hybrid` kèm mã lý do. Câu hỏi giá/mua/size/màu/còn hàng **đã nhận sản phẩm** và không có ý khác → `sql`: chỉ tra `product_variants` (giá/tồn đọc từ DB — nguyên tắc #4), **không gọi vector/rerank**. Chưa nhận sản phẩm hoặc có thêm ý khác (ship, đổi trả…) → `both`; còn lại → `hybrid`. Kèm bộ chạy nhánh (`executeRoute`: nhánh `sql` không bao giờ gọi hybrid) và bộ tra biến thể qua cổng (`VariantLookup`) có bản nối DB mỏng bọc `findActiveVariants`. Rủi ro: nhận diện "ý khác" bằng từ khóa tiếng Việt/Anh trên `asks` — chọn thiên về `both` khi không chắc (an toàn hơn, chỉ tốn thêm một lần tìm).

## Điểm chưa rõ

Không có. Tự quyết ở Q-PR1 (`QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Nhãn `price`/`purchase` (hoặc size/màu được trích, hoặc `asks` về giá/size/màu/tồn) + có sản phẩm đã nhận + không ý khác → `sql` — kiểm: `route.test.ts` (FR-136).
2. Cùng loại câu hỏi nhưng chưa nhận sản phẩm → `both`, không bao giờ `sql`; có thêm ý khác (ship, đổi trả, ý lạ) → `both` — kiểm: `route.test.ts` (FR-136).
3. Còn lại (khiếu nại, spam, hỏi tư vấn chung, không thuộc ý giá/size/màu/tồn) → `hybrid` — kiểm: `route.test.ts` (FR-136).
4. `executeRoute`: nhánh `sql` chỉ gọi tra DB, **không** gọi hybrid; `both` gọi cả hai; `hybrid` chỉ hybrid — kiểm: `execute-route.test.ts` (FR-136).
5. `lookupVariantsForRoute`: chuẩn hóa size/màu bằng `normalizeAttrs` (`đen`→`black`) trước khi tra; không sản phẩm → rỗng, không gọi DB — kiểm: `sql-lookup.test.ts` (FR-136, FR-129).
6. Thuộc tính (fast-check): `sql` ⇒ có sản phẩm; mọi đầu vào → đúng một nhánh, xác định; thêm một ý khác không bao giờ đổi `both`→`sql`; thêm sản phẩm không làm `hybrid` thành `sql`; đổi thứ tự `asks`/nhãn không đổi nhánh — kiểm: `route.test.ts` "property-based" (FR-136).
7. Ngưỡng coverage `packages/ai` giữ; `src/route/*.ts` ≥ 95% nhánh; cổng chung xanh — kiểm: `pnpm --filter @flow/ai test:coverage`, lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc

Đã đọc: `docs/05` FR-136; `docs/09` §4; `docs/10` `retrieval_logs`; `packages/ai/src/classify/extract-result.ts` (kiểu `ExtractResult`); `packages/db/src/queries/products.ts` (`findActiveVariants`); `packages/shared/src/products.ts` (`normalizeAttrs`); `packages/ai/vitest.config.ts`; `packages/ai/src/index.ts`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/route/route.ts` (+ `route.test.ts`), `route-topics.ts` (từ khóa chủ đề, kiểm qua `route.test.ts`), `execute-route.ts` (+ test), `sql-lookup.ts` (+ test).
- Sửa `packages/ai/src/index.ts` (xuất), `packages/ai/vitest.config.ts` (ngưỡng nhánh `src/route/*.ts`), `docs/testing/KIEM_TRA_TAY.md` (KT-PR), `docs/plans/{MASTER,QUYET_DINH_CHO_DUYET}.md`, `docs/gap-matrix.md`, `docs/codemap.md`, `docs/handoff/feat-pipe-route.md`.

## Migration

Không có (ghi `retrieval_logs.route` khi nối pipeline — cần bảng `retrieval_logs`, thuộc làn b / `KB-SEARCH-*`; ghi vào gap matrix).

## Test viết trước

`route.test.ts`, `execute-route.test.ts`, `sql-lookup.test.ts` viết trước, chạy đỏ (module chưa có) rồi mới viết mã (định tuyến là logic quy tắc).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/route` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng tự gửi/PII/migration; bản nối DB chỉ bọc truy vấn có sẵn đã có `workspace_id`).

## Rủi ro / câu hỏi cho chủ dự án

Từ khóa nhận "ý khác" là heuristic, sẽ hiệu chỉnh bằng bộ đánh giá GĐ2 (`AI-EVAL-*`). Không cần tài nguyên ngoài.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (không thêm thư viện; `executeRoute`/`VariantLookup` là cổng có ≥ 2 nơi dùng thật: nhánh sql + test/fixture, và pipeline `retrieve` sắp tới).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định đã có trong FR-136 + Q-PR1).

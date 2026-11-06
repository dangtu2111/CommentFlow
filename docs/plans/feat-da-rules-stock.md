# Kế hoạch `feat-da-rules-stock` — Độ tươi tồn kho + mẫu ngưng/hết hàng (phần gợi ý)

## Việc

Mã gap matrix: `DA-RULES-STOCK` · Spec: docs/05 FR-151, FR-157; docs/09 §4 (`decideAction` kiểm độ tươi tồn kho); docs/10 (`automation_settings.stock_stale_days`, `suggest_alternatives`; `products.status/category/updated_from_source_at`).

**Tóm tắt:** Thêm một hàm thuần `evaluateStockRules` cho biết tồn kho của sản phẩm còn "tươi" không (nguồn nhập tay/Excel hoặc nguồn đồng bộ lỗi mà quá `stock_stale_days` ngày → CŨ: AI không được nói số lượng/còn hàng, `decideAction` chuyển hướng "để shop kiểm kho"), và sản phẩm ngưng bán / hết hàng (dữ liệu còn tươi) thì nói rõ hết mẫu, kèm tối đa 2 mẫu thay thế cùng danh mục nếu Owner bật. Chỉ là phần gợi ý; tự gửi để GĐ4. Rủi ro thấp: hàm thuần, không DB/LLM; đọc cột `stock_stale_days`/`suggest_alternatives` từ DB là phần nối sau (không migration ở làn này).

## Điểm chưa rõ

Không có (xem Q-DRS1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Nguồn `manual`/`excel` có mốc cũ hơn `staleDays` → `freshness=stale`, `stockStale=true`, `canStateQuantity=false`; đúng ngưỡng (bằng `staleDays` ngày) vẫn tươi, +1 ms thì cũ; mốc thiếu → cũ — test `stock-rules.test.ts`.
2. Nguồn đồng bộ (`shopify`…`pancake`) chỉ cũ khi `syncError=true` — test.
3. Đầu vào hỏng/thiếu trường → `unknown`, `stockStale=true` (không "mở khi lỗi"), không ném — test + property-based.
4. Sản phẩm `archived` → `discontinued`; mọi biến thể đang bán `stock=0` và dữ liệu tươi → `sold_out`; còn tồn → `in_stock`; tồn `null` → không khẳng định hết hàng — test.
5. Dữ liệu cũ thì KHÔNG nói hết hàng/còn hàng (`availability=unknown`) và KHÔNG gợi ý thay thế — test.
6. Gợi ý thay thế chỉ khi `suggestAlternatives` bật và sản phẩm `sold_out`/`discontinued`; ≤ 2 mẫu, cùng danh mục (không phân biệt hoa/dấu), đang bán, tươi, còn tồn, có giá từ biến thể (giá thấp nhất còn hàng), không gồm chính nó; thứ tự ổn định (giá tăng, tên, id) và không phụ thuộc thứ tự đầu vào (property-based) — test.
7. `decideAction` nhận `risks.stockStale` từ `anyStockStale(...)`: có ≥ 1 sản phẩm ứng viên cũ → redirect `stock_stale` + mẫu `stock_check` — test.
8. Module ≥ 95% nhánh (glob `src/decide/*.ts` đã có) — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/codemap.md`, `docs/05` FR-151/157, `docs/10` (cột liên quan), `packages/ai/src/decide/decide-action.ts` (+ test), `packages/db/src/schema/cf/products.ts` (tên cột), `packages/shared/src/products.ts` (`foldText`).

## File sẽ sửa / tạo

- `packages/ai/src/decide/stock-rules.ts` (+ `stock-rules.test.ts`) — hàm thuần mới.
- `packages/ai/src/index.ts` — xuất.
- `docs/codemap.md` (dòng riêng), `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/CAN_BAN_CUNG_CAP.md`, `docs/handoff/feat-da-rules-stock.md`.

## Migration

Không có (chỉ làn b). Cột `stock_stale_days`/`suggest_alternatives` có trong docs/10 nhưng bảng `automation_settings` chưa tạo → nối ở `DA-RULES-STOCK-WIRE` (gap matrix).

## Test viết trước

`stock-rules.test.ts` (mọi nhánh, ca biên ngưỡng ±1 ms, mốc tương lai, Unicode danh mục, rỗng) + property-based (`fast-check` đã có ở `packages/ai`): hoán vị đầu vào không đổi kết quả; dữ liệu cũ không bao giờ cho `in_stock`/`sold_out`; gợi ý ≤ 2 và luôn thỏa điều kiện; đầu vào rác không ném.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide/stock-rules.test.ts src/decide/decide-action.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/thanh toán/cổng tự gửi/`sendRecheck`/che PII; hàm thuần chỉ thêm cờ chặn (thiên về chuyển hướng), không mở cổng.

## Rủi ro / câu hỏi cho chủ dự án

Không chặn. Chưa nối pipeline/DB (`DA-RULES-STOCK-WIRE`).

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có (không thư viện mới; `fast-check` đã cài).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-DRS1).

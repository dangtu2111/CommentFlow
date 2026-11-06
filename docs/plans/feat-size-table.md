# Kế hoạch `feat-size-table` — Bảng size có cấu trúc

## Việc

Mã gap matrix: `SIZE-TABLE` · Spec: FR-149, US-102, `docs/10_Database_Design.md` §3 `size_charts`, `docs/11` `/size-charts[/:id]`.

**Tóm tắt:** Thêm bảng `cf.size_charts` (Owner nhập: size nào ứng với khoảng chiều cao/cân nặng nào, theo sản phẩm hoặc theo danh mục) có RLS (khóa dữ liệu theo workspace), truy vấn tạo/sửa/xóa/liệt kê, và hàm tra size do CODE quyết định: đủ số đo và khớp đúng một size → trả size; thiếu số đo → hỏi lại; nằm giữa hai size hoặc ngoài bảng → mời ib; không có bảng → mời ib + ghi khoảng trống kiến thức. Rủi ro: tư vấn sai size → thà mời ib khi không chắc (hai size cùng khớp, kẽ hở giữa hai khoảng, ngoài bảng đều mời ib, không đoán).

## Điểm chưa rõ

Không có (mọi quyết định ghi ở Q-ST1, tự chọn phương án an toàn).

## Tiêu chí nghiệm thu

1. `parseSizeChartRow` in hoa size, bắt buộc đúng một trong sản phẩm/danh mục, ≥ 1 cận số đo, min ≤ max, số dương, tính `categoryNorm`; từ chối size rỗng/quá dài, ghi chú quá dài, số đo sai kiểu — kiểm bằng: `packages/shared/src/size-chart.test.ts` (FR-149).
2. `decideSize`: đủ số đo + khớp một size → `size`; thiếu số đo → `ask` đúng chiều thiếu (bảng chỉ có chiều cao thì không đòi cân nặng); hai size cùng khớp / kẽ hở giữa hai khoảng → `handoff between_sizes`; ngoài bảng → `handoff out_of_range`; không bảng → `handoff no_chart` + `recordGap` (kb_gaps topic `size`); biên đóng hai đầu; cận mở một đầu — kiểm bằng: test trên (FR-149, US-102).
3. Owner thêm/sửa/xóa/liệt kê; Staff chỉ đọc (ghi → RLS 42501); người ngoài workspace và workspace khác không thấy/ghi; trùng size cùng phạm vi → 23505; sản phẩm workspace khác → 23503; không đổi được phạm vi bằng UPDATE; CHECK ở DB chặn dữ liệu sai; xóa sản phẩm xóa bảng size — kiểm bằng: `packages/db/tests/size-charts.int.test.ts` (CI job `database`; làn không chắc có DB).
4. Chọn bảng: bảng riêng của sản phẩm thắng bảng danh mục, không trộn; sản phẩm không có bảng riêng dùng bảng danh mục (khớp không dấu/hoa thường); `lookupSize` end-to-end qua DB — kiểm bằng: test tích hợp trên.
5. `pnpm db:check-rls` đạt: bảng mới có RLS, ghi theo Owner/hệ thống, Staff/`withWorkspace` trần không ghi, UPDATE không đụng cột phạm vi — kiểm bằng: `check-rls.ts` danh sách kỳ vọng + `check-rls.test.ts` (CI).

## File sẽ đọc

Đã đọc: `docs/04` US-102, `docs/05` FR-149, `docs/10` §3 `size_charts`, mẫu `abbreviations` (migration 0041, schema, query) + `product_aliases` (0043, schema, query, test tích hợp, shared), `check-rls.ts` (các mảng kỳ vọng).

## File sẽ sửa / tạo

- `packages/shared/src/size-chart.ts` (+ test, + export ở `index.ts`): kiểm đầu vào, `decideSize`.
- `packages/db/src/schema/cf/size-charts.ts` (+ `index.ts`): bảng Drizzle.
- `packages/db/migrations/0044_size_charts.sql` (+ `meta/` do drizzle-kit): bảng, CHECK, RLS, GRANT.
- `packages/db/src/queries/size-charts.ts`, `runtime.ts`: tạo/sửa/xóa/liệt kê/`findSizeChartRows`/`lookupSize`.
- `packages/db/src/check-rls.ts`: kỳ vọng bảng mới.
- `packages/db/tests/size-charts.int.test.ts`.
- Docs: `docs/10` (thực tế), `QUYET_DINH_CHO_DUYET.md`, `gap-matrix`, `MASTER`, `codemap` (dòng riêng), `KIEM_TRA_TAY.md` (chưa có UI → chỉ ghi kiểm bằng test), handoff. `CAN_BAN_CUNG_CAP.md`: không cần (không tài nguyên ngoài).

## Migration

`0044_size_charts.sql` (số kế tiếp sau 0043 trên origin/main; fetch lại trước khi push). Tạo `cf.size_charts` + FK ghép `(workspace_id, product_id)` → `products` (cascade) + CHECK + unique một phần (theo sản phẩm / theo danh mục) + RLS + GRANT SELECT/DELETE/INSERT(cột)/UPDATE(cột không định danh). Đường lùi: `DROP TABLE cf.size_charts`.

## Test viết trước

`size-chart.test.ts` (đỏ vì chưa có module) và `size-charts.int.test.ts` trước khi viết truy vấn/migration.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/size-chart.test.ts` · `CF_LANE=b pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/size-charts.int.test.ts` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` một lần (migration + RLS + truy vấn).

## Rủi ro / câu hỏi cho chủ dự án

Chưa làm: API `/size-charts`, trang quản trị "Bảng size" (UI, Stitch), nối bước tra size vào pipeline (trích chiều cao/cân nặng từ câu khách → `extract`; ghi `kb_gaps` khi `recordGap`), câu mời ib theo `brand_voice` → ghi gap matrix.

## Đề xuất thay đổi

Cập nhật `docs/10` §3 `size_charts` phần "Thực tế" theo Q-ST1.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": `size_charts` ghi theo Owner (`is_workspace_owner`) hoặc hệ thống (`withActor`/`withJob`); Staff chỉ đọc

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-ST1).

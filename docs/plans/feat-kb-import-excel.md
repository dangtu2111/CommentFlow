# Kế hoạch `feat-kb-import-excel` — Nhập sản phẩm Excel/CSV

## Việc

Mã gap matrix: `KB-IMPORT-EXCEL` · Spec: FR-051 (docs/05 FR-E), FR-129/058 (docs/10 §3 `products`), docs/13 (upload Excel/CSV), US-003.

**Tóm tắt:** Owner tải file Excel (.xlsx) hoặc CSV, hệ thống tự gợi ý khớp cột (tên, SKU, giá, tồn, màu, size…), cho xem lỗi từng dòng, rồi xác nhận mới ghi vào bảng `products`/`product_variants` có sẵn (nguồn `excel`; chạy lại file thì cập nhật, không nhân đôi). Parser giới hạn kích thước/số dòng và KHÔNG chạy công thức (ô công thức bị từ chối). Rủi ro: file độc hại (zip bomb, công thức) — chặn bằng giới hạn cứng; ghi đè giá/tồn — chặn trường đã khóa (`locked_fields`) và chỉ ghi sau bước xác nhận. Không migration.

## Điểm chưa rõ

Không có (quyết định tự chọn ghi ở `QUYET_DINH_CHO_DUYET.md` mã **Q-KBIX1**).

## Tiêu chí nghiệm thu

1. CSV (dấu `,` `;` tab, BOM, ngoặc kép, xuống dòng trong ô) đọc đúng; file > 10 MB, > 5.000 dòng, > 50 cột bị từ chối với mã lỗi — `csv.test.ts`, `sheet-limits.test.ts`.
2. XLSX đọc đúng (chuỗi dùng chung, chuỗi nội tuyến, số, ô trống); ô công thức bị đánh dấu, KHÔNG dùng giá trị; zip khai báo giải nén > 50 MB bị từ chối; không phải zip → lỗi — `xlsx.test.ts`.
3. Gợi ý khớp cột từ tiêu đề vi/en (không dấu, hoa thường) — `mapping.test.ts`.
4. Kiểm từng dòng: thiếu tên, giá/tồn không hợp lệ (âm, chữ, thập phân tồn), ô bắt đầu `= + - @` không phải số (chống công thức), trùng SKU/khóa trong file → lỗi theo dòng + cột; giá kiểu `150.000`, `150,000`, `150000đ` → 150000 — `validate.test.ts`.
5. Gom dòng thành sản phẩm + biến thể (khóa sản phẩm = mã sản phẩm hoặc tên đã chuẩn hóa; khóa biến thể = SKU hoặc chữ ký thuộc tính), thuộc tính qua `normalizeAttrs` — `plan.test.ts`.
6. Ghi vào DB trong một giao dịch `withActor` (Owner), upsert theo `(workspace, source='excel', external_id)`; chạy lại không nhân đôi; trường trong `locked_fields` không bị ghi đè; workspace khác không thấy/không ghi được — `packages/db/tests/product-import.int.test.ts` (CI job `database`).
7. Giao diện `/app/products/import`: chỉ Owner (Staff 404); chọn file → khớp cột → xem lỗi → xác nhận; hành động xác nhận chỉ chạy với file+khớp cột đã gửi lại, kiểm MIME/đuôi/chữ ký `PK`; chuỗi vi+en đủ khóa — `import-action.test.ts`, `pnpm lint:i18n`, test khớp khóa.
8. `pnpm test:coverage` của `packages/shared` giữ ngưỡng 100/100/100/93.

## File sẽ đọc / sửa

Đã đọc: gap-matrix/MASTER dòng KB-IMPORT-EXCEL, `packages/shared/src/products.ts`, `search.ts` (`productSearchText`), `packages/db/src/queries/products.ts`, schema `products.ts`, migration 0034 (RLS/GRANT), `readiness` page/server, `try-ai/actions.ts`, `app-nav.ts`, `next.config.ts`.

Tạo: `packages/shared/src/product-import/{limits,csv,xlsx,mapping,validate,plan}.ts` + test cạnh file; `packages/db/src/queries/product-import.ts` + `packages/db/tests/product-import.int.test.ts`; `apps/web/src/server/product-import.ts` (+ test), `apps/web/src/app/app/(guarded)/products/import/{page,actions}.tsx`, `apps/web/src/components/products/import-wizard.tsx`.
Sửa: `packages/shared/src/index.ts`, `packages/shared/package.json` (+fflate), `packages/db/src/runtime.ts`(export), `apps/web/next.config.ts` (bodySizeLimit), `app-nav.ts` (+test), messages vi/en, `docs/codemap.md` (dòng riêng), gap-matrix, MASTER, `QUYET_DINH_CHO_DUYET.md`, `KIEM_TRA_TAY.md`, `docs/handoff/…` (nếu chưa xong).

## Migration

Không có (ghi vào `products`/`product_variants` hiện có; GRANT INSERT/UPDATE cho `cf_app` đã có ở 0034). Việc cần bảng mới (lịch sử lần nhập, kho tệp để parse ở worker) → ghi vào gap matrix `KB-IMPORT-EXCEL-WORKER` (làn b).

## Test viết trước

Toàn bộ logic thuần (limits, csv, xlsx, mapping, validate, plan) viết test đỏ trước rồi code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/product-import` · `pnpm --filter @flow/shared test:coverage` · `pnpm --filter @flow/web exec vitest run src/server/product-import.test.ts` · `CF_LANE=a pnpm test:db` (chỉ file mới nếu chạy được).

## Cần kiểm chứng độc lập không?

Có `verifier-security` một lần cuối (upload file không tin cậy, ghi dữ liệu nhiều dòng, RLS/`withActor`). Không có migration → không cần `verifier-db`.

## Rủi ro / câu hỏi cho chủ dự án

Parse chạy trong tiến trình web (không ở worker như docs/13 mô tả) vì chưa có kho tệp; bù bằng giới hạn cứng. Chuyển sang worker khi có kho tệp (xem Q-KBIX1).

## Đề xuất thay đổi

docs/13 dòng "parse ở worker" ghi thêm "(tạm thời parse đồng bộ có giới hạn cứng — Q-KBIX1)".

## Complexity tracking

- Thêm thư viện **fflate** (MIT, 0 phụ thuộc, ~30 KB) để giải nén .xlsx an toàn có giới hạn kích thước. Phương án đơn giản hơn đã loại: `read-excel-file`/`exceljs`/`xlsx` (SheetJS bản npm cũ, có CVE) — kéo nhiều phụ thuộc hoặc worker thread, khó kiểm soát giới hạn giải nén. Tự viết đọc XML tối thiểu (chỉ `sharedStrings` + 1 sheet).
- Nguyên tắc "logic ngoài route handler": tuân thủ. Không vi phạm khác.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới" (không có bảng mới; ghi bằng `withActor`, Owner)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-KBIX1).

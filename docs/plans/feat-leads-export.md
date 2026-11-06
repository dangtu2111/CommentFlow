# Kế hoạch `feat-leads-export` — Xuất Excel/CSV khách tiềm năng

## Việc

Mã gap matrix: `LEADS-EXPORT` · Spec: docs/05 FR-082 (xuất Excel/CSV), docs/09 (luật Meta 24 giờ/7 ngày), docs/10 §3.5 `leads`.

**Tóm tắt:** Làm phần lõi thuần để xuất danh sách khách tiềm năng ra CSV (mở được bằng Excel, có BOM UTF-8) và XLSX (tệp .xlsx tối giản). Số điện thoại/email mặc định bị che (chỉ hiện 4 số cuối); chỉ Owner mới được chọn xuất đầy đủ và phải bật bằng cấu hình. Có trần số dòng/dung lượng và chống chèn công thức (ô bắt đầu bằng `= + - @`… bị thêm dấu `'`). Rủi ro: lộ PII nếu xuất đầy đủ — nên mặc định che và cờ mặc định TẮT. Không migration, không giao diện, không gửi gì ra Meta.

## Điểm chưa rõ

Không có. (Tự chọn theo quy tắc hỏi, ghi `docs/plans/quyet-dinh/qlex1.md`.)

## Tiêu chí nghiệm thu

1. CSV có tiêu đề cố định, thứ tự cột cố định, BOM UTF-8, CRLF; ô chứa `,` `"` xuống dòng được đóng ngoặc đúng RFC 4180 — kiểm bằng `lead-export.test.ts`.
2. Mọi ô chữ bắt đầu bằng `= + - @` TAB CR (kể cả sau khoảng trắng/ký tự điều khiển đầu) được thêm `'` — ví dụ + property-based (fast-check): không ô nào ra CSV/XLSX bắt đầu bằng ký tự công thức.
3. Chế độ SĐT `masked` (mặc định) chỉ ra `••••••` + 4 số cuối, `hidden` bỏ cột, `full` chỉ khi người xuất là Owner và cấu hình cho phép, ngược lại bị từ chối `LEADS_EXPORT_FORBIDDEN` — kiểm bằng test từng nhánh.
4. Email che dạng `a***@miền`; chế độ theo cùng cấu hình.
5. Vượt `LEADS_EXPORT_MAX_ROWS` (mặc định 5000, trần cứng 20000) hoặc dung lượng tệp > 5 MB → lỗi `LEADS_EXPORT_TOO_LARGE`, không trả tệp cắt dở — test biên (đúng ngưỡng, ±1).
6. XLSX mở lại được bằng `parseXlsx` có sẵn của `product-import` (round-trip) và ô công thức không thành công thức (`t="inlineStr"`) — test.
7. Cờ `LEADS_EXPORT_ENABLED` mặc định TẮT; `readLeadExportConfig` từ chối giá trị lạ — test.
8. Nguồn dữ liệu là interface `LeadExportSource` (phân trang) + nguồn mock/fixture; việc xuất chỉ ĐỌC, không gọi nền tảng (không chạm luật 24 giờ/7 ngày, Private Reply 1 tin ≤ 7 ngày) — ghi trong tiêu đề module.
9. `pnpm --filter @flow/shared test:coverage` giữ ngưỡng; `pnpm precheck` xanh.

## File sẽ đọc

`packages/shared/src/{lead-contact.ts,reports.ts (csvCell),index.ts}`, `packages/shared/src/product-import/xlsx.ts` (đọc lại để test round-trip), `packages/db/src/queries/leads.ts` (kiểu `LeadRow`) — đã đọc.

## File sẽ sửa / tạo

- Tạo `packages/shared/src/lead-export.ts` + `lead-export.test.ts`
- Sửa `packages/shared/src/index.ts` (export)
- `env.example` (tên biến), docs riêng: `docs/codemap.d/mien-leads-export.md`, `docs/plans/quyet-dinh/qlex1.md`, `docs/can-ban-cung-cap.d/leads-export.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-lex.md`, `docs/handoff/feat-leads-export.md`, dòng gap-matrix/MASTER của `LEADS-EXPORT`.

## Migration

Không có. Phần cần bảng (ghi nhật ký mỗi lần xuất vào `action_logs`, hàng đợi xuất lớn, tải tệp) → gap `LEADS-EXPORT-WIRE`.

## Test viết trước

Toàn bộ `lead-export.test.ts` (ví dụ + property-based) viết đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/lead-export.test.ts`

## Cần kiểm chứng độc lập không?

Có (che PII, quyền xuất đầy đủ) — gọi `verifier-security` một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Xuất SĐT đầy đủ là hành vi nhạy cảm: mặc định che; bật `full` cần Owner + cấu hình.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (không thêm thư viện: dùng `fflate` đã có ở `@flow/shared`; `fast-check` đã cài).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi Q-LEX1).

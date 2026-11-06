# Kế hoạch `feat-ui-html-leads-reports` — Dựng Khách tiềm năng, Báo cáo, Nhật ký TỪ HTML Stitch

## Việc

Mã gap matrix: `UI-HTML-LEADS-REPORTS` · Nguồn dựng duy nhất: `design/stitch/{leads,reports,activity-log}.html`.

**Tóm tắt (UI-first, HTML-first):** thêm hai trang thật chỉ-đọc `/app/leads` (Kanban 4 cột, đọc `listLeads`/`countLeadsByStage` đã có) và `/app/reports` (đọc `loadReportRows` + `buildReport` đã có), và dựng lại `/app/activity` theo bảng của Stitch. Dùng kit (`PageHeader`, `Card`, `Stat`, `Chip`, `Avatar`); thêm `DataTable` vào kit (dùng ở Báo cáo + Nhật ký). Không đổi logic nghiệp vụ, không migration. Phần Stitch chưa có dữ liệu thật không dựng (Q-UIHLR1).

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIHLR1.

## Tiêu chí nghiệm thu

1. `/app/leads`: 4 cột (Mới, Đang tư vấn, Đã chốt, Hủy) có đếm theo `countLeadsByStage`, thẻ lead chỉ hiện 4 số cuối SĐT (không SĐT/email thô) — test `lead-view.test.ts` + đo bbox.
2. `/app/reports`: thẻ số liệu từ `buildReport`, bộ chọn 7/30 ngày (GET), biểu đồ cột theo giờ, bảng năng suất nhân viên; Staff chỉ thấy số cá nhân — test `report-view.test.ts`.
3. `/app/activity`: danh sách thành bảng `DataTable` (Thời gian · Tác nhân · Hành động · Đối tượng), bấm dòng mở chi tiết như cũ — giữ test hiện có xanh.
4. Kit: `DataTable` có test render; `.log-*` chuyển khỏi `globals.css` sang `styles/activity.css`; xóa trang mẫu `dev/ui/leads`, `dev/ui/bao-cao`, `auto-leads.css`, khối `rl-` báo cáo (không còn dùng).
5. 390px không tràn ngang; Be Vietnam Pro từ `next/font` (đã có) — kiểm `so-bbox.json`.
6. Công cụ xanh: precheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/{leads,reports,activity-log}.html`; `queries/{leads,reports}.ts`, `shared/reports.ts`; `server/action-log.ts`; `components/activity/*`; `ui/{stat,card,chip,avatar,page-header}.tsx`; `app-nav.ts`; i18n vi/en.

## File sẽ sửa / tạo

Kit: `ui/data-table.{tsx,css}`, `ui/ui.css`, `ui/kit.test.tsx`. Leads: `app/app/(guarded)/leads/page.tsx`, `components/leads/*`, `lib/lead-view.ts`, `server/leads.ts`, `styles/leads.css`. Reports: `app/app/(guarded)/reports/page.tsx`, `components/reports/*`, `lib/report-view.ts`, `server/reports.ts`, `styles/reports.css`. Nhật ký: `activity-list.tsx`, `activity/page.tsx`, `styles/activity.css`, `globals.css`. Chung: `app-nav.ts` (+test), i18n vi/en, `layout.tsx`, `e2e/support/measure-leads-reports.mjs`, docs.

## Migration

Không có.

## Test viết trước

`lead-view.test.ts` (gom thẻ theo cột, che SĐT, chữ viết tắt), `report-view.test.ts` (khoảng ngày, định dạng thời gian, cột giờ), test render `DataTable`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib src/components/ui`; `pnpm lint:i18n`; `pnpm typecheck`.

## Cần kiểm chứng độc lập không?

Không: chỉ đọc, đi qua `withActor` (RLS), không trả SĐT/email thô. (Trang đọc dữ liệu lead nên đã tự rà: không dùng `getLeadCipher`.)

## Rủi ro / câu hỏi cho chủ dự án

Kéo-thả đổi giai đoạn, ngăn chi tiết, bộ lọc, tìm kiếm, sản phẩm/giá/ghi chú CSKH của lead; xu hướng theo ngày, nhãn ý định, top bài viết, tên nhân viên (cần dữ liệu/bảng chưa có) → ghi gap, không dựng.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong spec/ADR hoặc Q-UIHLR1).

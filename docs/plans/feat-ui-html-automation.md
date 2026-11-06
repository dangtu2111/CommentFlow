# Kế hoạch `feat-ui-html-automation` — Dựng lại Tự động hóa + Quy tắc spam TỪ HTML Stitch

## Việc

Mã gap matrix: `UI-HTML-AUTOMATION` · Nguồn dựng duy nhất: `design/stitch/automation.html`, `design/stitch/spam-rules.html`.

**Tóm tắt (UI-first, HTML-first):** dựng lại hai trang theo HTML Stitch bằng kit: thẻ + đầu mục có biểu tượng (`Card`, `SectionHead`), banner (`Banner`), tiêu đề (`PageHeader`) và khối nền nhạt mới `Inset` (thêm vào kit, dùng ở cả hai trang). Ma trận chuyển thành bảng kênh × nhãn cho từng đối tượng (bình luận/tin nhắn). Không đổi logic nghiệp vụ, không migration. Phần Stitch chưa có dữ liệu/chức năng thật không dựng (Q-UIHA1).

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIHA1.

## Tiêu chí nghiệm thu

1. Ma trận: mỗi đối tượng một bảng kênh × (Hỏi giá/Tư vấn/Mua hàng), tên trường form `mode:<kênh>:<đối tượng>:<nhãn>` giữ nguyên — kiểm bằng `e2e/support/measure-automation.mjs` + ảnh.
2. Cài đặt chung dùng `Inset` (ngưỡng, trễ, giới hạn, giờ, từ khóa, chữ ký); lưu vẫn qua `saveAutomationAction` — kiểm ảnh/typecheck.
3. Spam: điều kiện | hành động (radio), Xem trước + Lưu; Enter chỉ xem trước — kiểm ảnh.
4. 390px: không tràn ngang (`overflow390=false`) — kiểm `so-bbox.json`.
5. Kit: `Inset` có test render; CSS trang tách `styles/automation.css`, `styles/spam-rules.css`, `auto-leads.css` giảm 218 dòng.
6. Công cụ xanh: precheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/{automation,spam-rules}.html`; `automation-form.tsx`; `spam-rule-builder.tsx`; hai `page.tsx`; `styles/auto-leads.css`; `ui/{card,section-head,banner,page-header}.tsx`; i18n vi/en.

## File sẽ sửa / tạo

Kit: `ui/inset.{tsx,css}`, `ui/ui.css`, `ui/kit.test.tsx`. Trang: hai `page.tsx`, `automation-form.tsx`, `spam-rule-builder.tsx`, `styles/{automation,spam-rules}.css` (mới), `auto-leads.css`, `app/layout.tsx`, i18n vi/en (+5 khóa), `e2e/support/measure-automation.mjs`, docs (gap-matrix, MASTER, codemap.d, quyết định, KT, handoff).

## Migration

Không có.

## Test viết trước

Test render kit `Inset`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui`; `pnpm lint:i18n`; `pnpm typecheck`.

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện).

## Rủi ro / câu hỏi cho chủ dự án

Dừng khẩn cấp, thẻ số liệu hôm nay, kiểu trả lời, danh sách/nhật ký quy tắc chưa có dữ liệu/bảng → ghi gap, không dựng.

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

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong spec/ADR hoặc Q-UIHA1).

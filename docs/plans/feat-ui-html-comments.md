# Kế hoạch `feat-ui-html-comments` — Dựng lại hộp thư Bình luận TỪ HTML Stitch

## Việc

Mã gap matrix: `UI-HTML-COMMENTS` · Spec: docs/08 §7.1 · Nguồn dựng duy nhất: `design/stitch/comments.html` (+ `docs/design/stitch-prd-brief.md`, token từ `tokens.css`).

**Tóm tắt (UI-first, HTML-first):** dựng lại hộp thư Bình luận theo đúng bố cục HTML Stitch: bàn làm việc 3 cột cao bằng màn hình (cột lọc 224px · danh sách 384px · chi tiết co giãn) có dải phụ phía trên, thanh bên 256px + thanh trên 64px; trong cột chi tiết là các thẻ (bối cảnh bài viết, khách + bình luận, AI phân tích + nhãn, câu trả lời AI) và thanh hành động dính đáy (Ẩn · Gửi kèm phím tắt). Bố cục 3 cột + dải phụ + ô phím tắt là mẫu mới → thêm vào kit (`Workbench`, `Kbd`), không nhân bản trong trang. Không đổi logic nghiệp vụ, không migration. Số liệu/chức năng Stitch không có thật (ca làm, SLA, độ chính xác AI, độ tin cậy %, lý do AI, lịch sử CRM, giao cho tôi, Nhắn riêng, Viết lại, Dừng khẩn cấp, ảnh sản phẩm…) không dựng — Q-UIHC1.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIHC1.

## Tiêu chí nghiệm thu

1. Khung: thanh trên cao 64px, thanh bên rộng 256px dính theo chiều cao màn hình (1440px) — kiểm bằng `e2e/support/measure-comments.mjs` (so bbox với HTML Stitch).
2. Bàn làm việc: dải phụ cao 44px, cột 1 = 224px, cột 2 = 384px, cột 3 phần còn lại; mỗi cột cuộn riêng, trang không cuộn — kiểm bằng bbox.
3. Cột 1: 10 trạng thái (đủ tab hiện có) có chấm/biểu tượng + số, tab chọn nền màu nút chính; nền tảng 2×2; 6 nhãn ý định; công tắc "Chỉ bài quảng cáo" — kiểm bằng ảnh + test `inbox-visual`.
4. Cột 2: ô tìm + nút lọc, dòng sắp xếp, thẻ bình luận (ảnh đại diện + huy hiệu nền tảng, trích nội dung, chip nhãn, chip trạng thái), thẻ đang chọn có thanh trái, chân "Hiển thị n / tổng" — kiểm bằng ảnh + bbox thẻ.
5. Cột 3: thẻ bối cảnh, khách, AI phân tích (nhãn + Đổi nhãn), ô trả lời AI, thanh hành động dính đáy với `Ctrl + Enter` — kiểm bằng ảnh + bbox nút gửi.
6. Dải phụ nêu đúng các phím tắt thật (Ctrl/⌘+Enter, J/K, X, H) — đọc `lib/bulk-shortcuts.ts`.
7. Mobile 390px: hai ngăn (danh sách / chi tiết) vẫn đúng, không tràn ngang — ảnh `sau-390`.
8. Kit: `Workbench`/`Kbd` có test render; CSS trang bình luận chuyển ra `styles/inbox.css` + `ui/workbench.css`, `globals.css` giảm dòng.
9. Công cụ xanh: precheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/comments.html`; `comments/page.tsx`; `(guarded)/layout.tsx`; `components/comments/{inbox-tabs,inbox-list,inbox-toolbar,comment-detail,reply-composer,suggestion-panel}.tsx`; `ui/{card,chip,split-layout}.tsx`; `styles/globals.css` (khối inbox, shell); `lib/inbox-filters.ts`, `lib/bulk-shortcuts.ts`; `app/dev/ui/comments/page.tsx`.

## File sẽ sửa / tạo

- Kit: `ui/workbench.{tsx,css}` (Workbench, WorkbenchStrip, WorkbenchPane), `ui/kbd.{tsx,css}`, `ui/ui.css` (+2 import), test trong `ui/kit.test.tsx`.
- Trang: `comments/page.tsx`, `components/comments/{inbox-tabs,inbox-toolbar,inbox-list,comment-detail,reply-composer}.tsx`, `styles/inbox.css` (mới; khối inbox rút từ `globals.css`), `app/layout.tsx` (import), `globals.css` (bỏ khối inbox, chỉnh khung 64/256px).
- `app/dev/ui/comments/page.tsx` — dùng cùng bố cục.
- i18n vi/en (`comments.*` thêm khóa), docs: gap-matrix, MASTER, codemap.d, quyết định, handoff, `docs/testing` KT; `e2e/support/measure-comments.mjs`.

## Migration

Không có.

## Test viết trước

Hàm thuần mới (nếu có) ở `lib/inbox-visual.ts`; test render kit `Workbench`/`Kbd`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui src/lib/inbox-visual.test.ts`; `pnpm lint:i18n`; `pnpm typecheck`.

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện; không chạm auth/RLS/gửi tự động).

## Rủi ro / câu hỏi cho chủ dự án

Chỉnh khung (thanh trên 64px, thanh bên 256px dính) ảnh hưởng mọi trang trong `(guarded)`; kiểm bằng ảnh trang Cài đặt/Tin nhắn mẫu.

## Đề xuất thay đổi

Lọc theo nhãn AI (cột 1 hiện là chú giải, chưa lọc) → cần tham số `label` + truy vấn DB: ghi gap `INBOX-FILTER-LABEL`.

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

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong spec/ADR hoặc Q-UIHC1).

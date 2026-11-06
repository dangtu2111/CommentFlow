# Bàn giao — nhánh `feat-ui-html-comments`

Cập nhật: 2026-11-06 · Mục gap matrix: UI-HTML-COMMENTS · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-ui-html-comments.md`

## Đã làm
- Kit mới: `Workbench`/`WorkbenchStrip`/`WorkbenchFilters|List|Detail`, `Kbd` (+ test trong `ui/kit.test.tsx`).
- Hộp thư Bình luận dựng từ HTML Stitch: dải phụ, cột lọc, đầu danh sách, thẻ chi tiết, thanh hành động dính đáy (Ẩn + Gửi `Ctrl + Enter`); khung thanh trên 64px / thanh bên 256px dính.
- CSS: `styles/inbox.css` mới; `globals.css` giảm 505 dòng (khối inbox/chi tiết/trả lời chuyển sang `inbox.css`; các lớp `inbox-*` dùng chung với Bài viết/Nhật ký giữ ở `globals.css`).
- Đo bbox so Stitch: cột 224/384/576 và dải phụ 44px, thanh trên 64px, thanh bên 256px khớp; số liệu ở `docs/plans/ui-fidelity/ui-html-comments/so-bbox.json` (ảnh trước/sau cùng thư mục).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `design/stitch/comments.html` | Phần không có dữ liệu thật đã loại (Q-UIHC1): ca làm, SLA, độ chính xác AI, độ tin cậy %, lý do AI, CRM, Giao cho tôi, Nhắn riêng, Viết lại, Dừng khẩn cấp |
| `lint:i18n` (eslint) | Chuỗi thuần trong prop (`kind="x"`) bị chặn → dùng component riêng/hằng số; `aria-label` không dùng trên `div` |

## Còn lại
1. `INBOX-FILTER-LABEL`: lọc theo nhãn AI (cột trái hiện là chú giải).
2. Tin nhắn (`msg-layout`) có thể chuyển sang kit `Workbench` ở việc riêng (chưa làm để không đổi giao diện đã duyệt).
3. Thanh trên theo HTML (chip kênh, "AI tự động", Dừng khẩn cấp) cần dữ liệu/chức năng thật.

## Lệnh test liên quan
```
pnpm --filter @flow/web exec vitest run src/components/ui
node e2e/support/measure-comments.mjs   # cần cổng xem trước :3101
```

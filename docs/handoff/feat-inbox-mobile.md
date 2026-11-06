# Bàn giao — nhánh `feat-inbox-mobile`

Cập nhật: 06/11/2026 · Mục gap matrix: INBOX-MOBILE · Agent vừa làm: claude (làn c)
Kế hoạch: `docs/plans/feat-inbox-mobile.md`

## Đã làm
- Hai ngăn mobile (< 900px) cho trang Bình luận bằng `data-pane` + CSS; `lib/inbox-pane.ts` (+test); i18n `comments.detail.back` vi/en; QM1; KT-016.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `comments/page.tsx` | Server Component; `view.selected` (`?c=`) quyết định có chi tiết |
| `globals.css` `.inbox*` | Trước đây < 900px xếp dọc tab → danh sách → chi tiết |
| `design/stitch/comments.png` | Chỉ desktop, không có mobile |

## Còn lại
- Playwright 390px (E2E cần seed bình luận — chưa có hạ tầng), thiết kế mobile Stitch, kiểm tay KT-016.

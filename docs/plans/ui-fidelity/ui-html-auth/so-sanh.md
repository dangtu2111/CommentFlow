# So sánh Stitch (file://) và bản dựng — `/login` (feat-ui-html-auth)

Công cụ: `node e2e/tools/ui-compare-auth.mjs [http://localhost:3101]` (Playwright, bounding box + computed style).

| Rộng | Phần tử | Stitch (w×h) | Bản dựng (w×h) | Bo góc (S / D) |
|---|---|---|---|---|
| 1440 | Đầu trang | 1440×64 | 1440×64 | 0 / 0 |
| 1440 | Panel trái | 604×727 | 604×717 | 12 / 12 |
| 1440 | Thẻ đăng nhập | 604×650 | 604×558 | 12 / 12 |
| 1440 | Tiêu đề thẻ | 524×28 (22px) | 524×28 (22px) | — |
| 1440 | Ô email | 524×44 | 524×44 | 8 / 8 |
| 1440 | Nút gửi | 524×44 | 524×44 | 8 / 8 |
| 390 | Đầu trang | 390×64 | 390×64 | 0 / 0 |
| 390 | Thẻ đăng nhập | 342×697 | 342×563 | 12 / 12 |
| 390 | Tiêu đề / ô email / nút | 294×28 / 294×44 / 294×44 | 294×28 / 294×44 / 294×44 | 8 / 8 |

**Chưa khớp (có chủ đích, Q-UIAUTH1):** thẻ thấp hơn 92px (thiết kế có nút Google, "ghi nhớ 30 ngày", chân pháp lý/huy hiệu SSL không có thật); panel trái ẩn < 960px (bản dựng đưa form lên đầu); cỡ chữ gốc 16px theo token (Stitch 13px); huy hiệu/số liệu minh họa đã bỏ.

**CSS/TSX trước → sau:** `globals.css` 2143 → 1847 dòng (−296); CSS xác thực nay ở `components/auth/*.css` (≈ 310 dòng, mỗi thành phần một file); markup biểu tượng+tiêu đề lặp ở 4 trang → 1 thành phần `AuthStatus`.

## KT-ASH — AI đã gửi + Đánh dấu sai (AI-SENT-HISTORY, FR-075, feat-ai-sent-history)

> Chưa có bảng `drafts`/`automation_events` (`AI-SENT-HISTORY-DB`) nên danh sách luôn trống; chỉ kiểm được giao diện trống + menu + 2 ngôn ngữ. Nút Đánh dấu sai kiểm bằng test tự động (store bộ nhớ).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập Owner, mở menu **AI đã gửi** (vi) | Trang `/app/ai-sent`, tiêu đề "Lịch sử AI đã tự gửi", thông báo trống, 3 liên kết lọc |
| 2 | Đổi ngôn ngữ sang English | Menu "AI sent", tiêu đề "Replies the AI sent automatically", chữ trống bằng tiếng Anh |
| 3 | Đăng nhập Staff, mở menu **AI đã gửi** | Staff cũng thấy menu và trang (không 404) |
| 4 | Mở `/app/ai-sent?status=abc&page=-3` | Không lỗi; hiện như bộ lọc "Tất cả", trang 1 |

## KT-PRP — Nhắn riêng từ bình luận (FR-046, feat-private-reply)
Điều kiện: CHỜ `PRIVATE-REPLY-WIRE` (nối DB + giao diện) và Page Facebook thử có quyền `pages_messaging`. Hiện chỉ kiểm bằng test tự động: `pnpm --filter @flow/ai test`.
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Dùng tài khoản khác bình luận vào bài của Page thử, nhân viên bấm Nhắn riêng | Người bình luận nhận đúng 1 tin trong Messenger |
| 2 | Bấm Nhắn riêng lần nữa cho cùng bình luận | Bị chặn, hiện "Đã nhắn riêng cho bình luận này (chỉ được 1 tin)" |
| 3 | Thử bình luận cũ hơn 7 ngày | Bị chặn, hiện "Đã quá 7 ngày…" |
| 4 | Xóa bình luận trên Facebook rồi bấm Nhắn riêng | Bị chặn, hiện "Bình luận đã bị xóa" |
| 5 | Bình luận Instagram/TikTok | Không có nút / bị chặn "chưa hỗ trợ" |
| 6 | Lặp bước 1–3 ở tiếng Anh | Chuỗi đúng ngôn ngữ |

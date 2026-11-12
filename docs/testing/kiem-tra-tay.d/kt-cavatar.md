## KT-CAVATAR — Ảnh đại diện người bình luận (feat-comment-author-avatar)

> Làm bằng tài khoản Owner, kênh Facebook thật đã kết nối, worker chạy với `FB_CONNECTOR_ENABLED=true`. Mục đích chính: biết Facebook có trả ảnh cho app của bạn không (quyền riêng tư của người dùng giới hạn việc này).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Dùng một tài khoản Facebook cá nhân (có ảnh đại diện thật) bình luận vào bài của Page | Bình luận hiện ở `/app/comments` sau vài giây |
| 2 | Xem log worker (không có URL/tên): tìm dòng `ảnh đại diện người bình luận` | `outcome: saved` (Facebook trả ảnh) hoặc `none` (không trả: ảnh mặc định/giới hạn quyền riêng tư) hoặc cảnh báo `error` kèm MÃ lỗi |
| 3 | Mở `/app/comments`: dòng bình luận vừa nhận | Nếu `saved`: hiện ảnh tròn thật của người bình luận; nếu `none`/`error`: giữ chữ cái đầu như cũ |
| 4 | Mở chi tiết bình luận đó | Ảnh hiện cùng huy hiệu "FB" ở góc; không có khung vỡ ảnh |
| 5 | Xóa bình luận trên Facebook | Sau khi hệ thống nhận sự kiện xóa, bình luận bị xóa trắng và URL ảnh bị xóa (kiểm bằng giao diện: không còn ảnh) |
| 6 | Bình luận bằng danh nghĩa chính Page | Không lưu bình luận (chống vòng lặp) nên không có ảnh |
| 7 | Chờ vài ngày rồi mở lại bình luận cũ | Ảnh có thể không còn tải được (URL hết hạn): giao diện không được vỡ; ghi nhận nếu xảy ra để quyết định làm mới/lưu file riêng |

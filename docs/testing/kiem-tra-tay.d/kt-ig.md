## KT-IG — Connector Instagram với tài khoản thật (IG-CONNECTOR, FR-013)

Điều kiện: tài khoản IG Business thử liên kết Page thử; kênh Instagram đã lưu (sau `IG-CHANNEL-CONNECT`); worker chạy với `IG_CONNECTOR_ENABLED=true` trên môi trường thử. **Chưa chạy được ở thời điểm Xong-mock.**

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Dùng tài khoản khác bình luận vào một bài của tài khoản thử | Webhook `comments` tới; bình luận hiện ở hộp thư với đúng bài, tác giả, nội dung |
| 2 | Trả lời bình luận đó từ ứng dụng | Câu trả lời hiện dưới bình luận trên Instagram; hệ thống ghi nhận đã gửi |
| 3 | Ẩn bình luận từ ứng dụng, rồi bỏ ẩn | Bình luận ẩn/hiện trên Instagram tương ứng (ghi lại nếu bỏ ẩn bị từ chối) |
| 4 | Bình luận do chính tài khoản thử viết | Không vào pipeline (chống vòng lặp) |
| 5 | Trả lời lồng (trả lời vào một bình luận đã có trả lời) | Ghi lại hành vi thật (Instagram chỉ nhận trả lời cấp 1?) để chỉnh khai báo `reply` |

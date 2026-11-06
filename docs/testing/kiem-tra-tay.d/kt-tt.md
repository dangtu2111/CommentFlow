## KT-TT — Connector TikTok với tài khoản thật (TIKTOK-CONNECTOR, FR-015)

Điều kiện: có quyền TikTok API for Business và tài khoản Business thử; kênh TikTok đã lưu (sau `TIKTOK-CHANNEL-CONNECT`); worker chạy với `TIKTOK_CONNECTOR_ENABLED=true` trên môi trường thử. **Chưa chạy được ở thời điểm Xong-mock.**

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Dùng tài khoản khác bình luận vào một video của tài khoản thử, chờ chu kỳ polling | Bình luận hiện ở hộp thư đúng video, tác giả, nội dung |
| 2 | Trả lời bình luận đó từ ứng dụng (≤ 150 ký tự) | Câu trả lời hiện dưới bình luận trên TikTok; hệ thống ghi đã gửi |
| 3 | Trả lời bình luận quá 48 giờ / dài hơn 150 ký tự | Bị chặn trước khi gọi TikTok (ghi lại nếu TikTok cho phép khác khai báo) |
| 4 | Xem một bình luận TikTok ở hộp thư | Không có nút Ẩn (chưa hỗ trợ) |
| 5 | Bình luận do chính tài khoản thử viết | Không vào pipeline (chống vòng lặp) |
| 6 | Thử token hết hạn/thu hồi quyền | Kênh báo hết hạn, banner Kết nối lại |

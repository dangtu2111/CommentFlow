## KT-MEDIA — Tải ảnh/video và đăng kèm bài (feat-composer-media)

> Làm bằng Owner, trên Page thử. Bước 1 không cần kho; bước 2 trở đi cần `MEDIA_S3_*` (xem `docs/can-ban-cung-cap.d/composer-media.md`); bước 9–12 cần `FB_PUBLISH_ENABLED` và `pages_manage_posts`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `/app/composer` khi chưa cấu hình kho | Phần "Hình ảnh và video" báo chưa bật, nút Thêm media bị khóa |
| 2 | Thêm 2 ảnh JPG/PNG | Thanh tiến độ rồi ảnh xem trước; nút Lưu/Đăng tạm khóa lúc đang tải |
| 3 | Đổi tên một file `.html` thành `.jpg` rồi thêm | Báo "Chỉ nhận ảnh JPG, PNG, WebP hoặc video MP4, MOV" (kiểm bằng nội dung) |
| 4 | Thêm ảnh > 8MB / video > 200MB | Báo quá lớn, không tải |
| 5 | Thêm 1 video khi đã có ảnh (và ngược lại) | Báo không trộn ảnh với video |
| 6 | Thêm tới 11 ảnh | Ảnh thứ 11 bị từ chối "Tối đa 10 ảnh" |
| 7 | Lưu bản nháp, mở lại bài | Ảnh/video đã chọn hiện lại đúng thứ tự |
| 8 | Bấm × ở một ảnh rồi lưu | Ảnh bị gỡ khỏi bài |
| 9 | Đăng ngay bài có 2 ảnh (Page thử) | Bài lên Facebook kèm 2 ảnh theo thứ tự |
| 10 | Đăng ngay bài có 1 video | Bài video lên Facebook (Facebook có thể xử lý thêm vài phút) |
| 11 | Dừng SeaweedFS rồi đăng bài có ảnh | Lịch báo thất bại "media_unavailable", không có bài nào lên Facebook |
| 12 | Mở `/app/api/media/<id>` bằng tài khoản Staff hoặc workspace khác | 404/không xem được |

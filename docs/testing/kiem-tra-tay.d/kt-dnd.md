## KT-DND — Kéo thả bài trên Lịch và hộp thoại bài (feat-calendar-dnd)

> Làm bằng Owner, Page thử, `FB_PUBLISH_ENABLED` bật. Dùng chuột (kéo thả HTML5 không chạy trên cảm ứng).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Lên lịch một bài vài ngày tới (Biên tập), vào `/app/calendar` | Thẻ bài hiện ở đúng ngày, con trỏ thành bàn tay khi rê vào |
| 2 | Kéo thẻ sang ngày khác cùng tuần | Ô đích sáng viền; thả xong: "Đã chuyển bài sang ngày mới (giữ nguyên giờ đăng)"; thẻ ở ngày mới, cùng giờ |
| 3 | Kéo thẻ sang ngày đã qua | Thông báo giờ không hợp lệ, bài giữ nguyên |
| 4 | Bài đã đăng/đang đăng/lỗi | Không kéo được |
| 5 | Kéo một bản nháp (khung "Bản nháp") vào một ngày | Mở hộp thoại, ngày đã điền sẵn, giờ 09:00; CHƯA lên lịch cho tới khi bấm "Lên lịch đăng" |
| 6 | Click thẻ bài | Hộp thoại giữa màn hình: nội dung, ngày giờ, kênh, xem trước kiểu Facebook (đúng tên và ảnh đại diện kênh, ảnh/video của bài) |
| 7 | Sửa nội dung trong hộp thoại | Xem trước đổi theo lúc gõ; "Lưu thay đổi" → "Đã lưu thay đổi của bài" |
| 8 | Đổi giờ trong hộp thoại rồi lưu | Thẻ chuyển đúng ngày/giờ mới |
| 9 | Hộp thoại bài đã đăng | Chỉ xem (ô nội dung chỉ đọc, không nút lưu) |
| 10 | Tắt `FB_PUBLISH_ENABLED`, mở hộp thoại bản nháp | "Lên lịch" bị khóa kèm giải thích; "Lưu nháp" vẫn được |

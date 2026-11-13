## KT-PUB — Đăng bài lên Facebook từ Biên tập bài viết và Lịch đăng (feat-post-publishing)

> Làm bằng Owner, trên một PAGE THỬ, ở cả `vi` và `en`. Bước 1–7 không cần Meta thật; bước 8 trở đi cần `FB_PUBLISH_ENABLED=true` ở web và worker, `FB_CONNECTOR_ENABLED=true`, và kênh có quyền `pages_manage_posts` (xem `docs/can-ban-cung-cap.d/post-publishing.md`).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `/app/composer` khi cờ TẮT | Biểu ngữ nói đăng bài chưa bật; "Lưu bản nháp" bấm được; "Lên lịch đăng"/"Đăng ngay" bị khóa |
| 2 | Gõ nội dung, chọn một kênh, "Lưu bản nháp" | Về Biên tập kèm "Đã lưu bản nháp"; nội dung và kênh được điền lại |
| 3 | `/app/calendar` | Bản nháp hiện ở khung "Bản nháp"; bấm vào mở lại để sửa |
| 4 | Bấm "Xóa" ở bản nháp | Về Lịch kèm "Đã xóa bài"; bản nháp biến mất |
| 5 | Kênh chưa có quyền `pages_manage_posts` | Cảnh báo đỏ ngay khi chọn kênh (không chặn lưu nháp) |
| 6 | Đăng nhập Staff, vào thẳng `/app/composer` | 404 |
| 7 | Mở `/app/composer?id=<id bài của workspace khác>` | Không thấy bài; chuyển về Lịch kèm thông báo |
| 8 | (Cờ BẬT) Chọn kênh có quyền, gõ nội dung, chọn ngày giờ cách 3 phút, "Lên lịch đăng" | Về Lịch đúng tuần, thẻ "Đã lên lịch" đúng ngày/giờ theo múi giờ cửa hàng |
| 9 | Mở thẻ → "Hủy lịch" | Bài về nháp, mở ở Biên tập để sửa |
| 10 | Lên lịch lại, chờ tới giờ | Trong ~1 phút bài hiện trên Facebook; thẻ chuyển "Đã đăng"; chi tiết ghi "Đã đăng" cho kênh |
| 11 | "Đăng ngay" | Bài hiện trên Facebook trong ~1 phút, đúng MỘT bài (không trùng) |
| 12 | Bật "Dừng khẩn cấp" rồi lên lịch/Đăng ngay | Bài ở "Đã lên lịch" nhưng KHÔNG đăng; bỏ dừng thì đăng ở lần quét kế tiếp |
| 13 | Dùng kênh thiếu quyền `pages_manage_posts`, "Đăng ngay" | Thẻ "Đăng lỗi", kênh ghi "chưa có quyền đăng bài"; không có bài nào lên Facebook |
| 14 | Tắt worker khi bài đang đăng rồi bật lại sau >15 phút | Kênh hiện "Chưa rõ kết quả" kèm lời nhắc kiểm tra Facebook; hệ thống KHÔNG tự đăng lại |

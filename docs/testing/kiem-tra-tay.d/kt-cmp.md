## KT-CMP — Biên tập bài viết và Lịch đăng (feat-composer-calendar-ui)

> Làm ở cả `vi` và `en`, bằng Owner rồi bằng Staff. Chỉ là giao diện: chưa lưu/lên lịch/đăng bài.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Đăng nhập Owner, nhìn thanh bên | Có nhóm thứ ba "Biên tập & lịch đăng" (giữa "Điều hướng vận hành" và "Hệ thống & trí tuệ") gồm "Biên tập bài viết" và "Lịch đăng" |
| 2 | Đăng nhập Staff, nhìn thanh bên và vào thẳng `/app/composer`, `/app/calendar` | Không thấy nhóm; hai đường dẫn trả 404 |
| 3 | `/app/composer`: xem danh sách kênh | Đúng các kênh đã kết nối của workspace; kênh hết hạn/ngắt bị khóa; chưa có kênh thì báo trống kèm liên kết "Kết nối kênh" |
| 4 | Gõ nội dung dài (kể cả emoji, tiếng Việt có dấu) | Bộ đếm Facebook/Instagram/TikTok tăng đúng; vượt 2.200 thì IG/TikTok đổi màu đỏ kèm "Vượt giới hạn"; xem trước hiện đúng nội dung và đổi tên Page theo tab |
| 5 | Bấm Lưu bản nháp / Lên lịch đăng / Đăng ngay / AI gợi ý / Thêm media / Gắn sản phẩm | Tất cả vô hiệu (không phản hồi); biểu ngữ nói rõ nội dung chưa được lưu hay gửi đi |
| 6 | `/app/calendar` | Lưới 7 cột Thứ 2 → Chủ nhật, cột hôm nay được làm nổi bật; bài thật của tuần nằm đúng ngày/giờ theo múi giờ cửa hàng |
| 7 | Bấm tuần trước/sau/Hôm nay; sửa `?w=` thành ngày sai hoặc quá xa | Chuyển tuần đúng; tham số sai quay về tuần hiện tại, không lỗi |
| 8 | Lọc Facebook/Instagram/TikTok | Chỉ còn bài của nền tảng đó; số trên chip và KPI khớp |
| 9 | Bấm một bài | Khung chi tiết bên phải: kênh, giờ đăng, nội dung, ảnh (nếu có), số bình luận; "Xem bài gốc" mở tab mới; Đóng/nền mờ quay lại lưới |
| 10 | Mở trang khi tuần không có bài | Báo "Tuần này chưa có bài nào" kèm gợi ý, không có số liệu bịa |
| 11 | Thu nhỏ còn 390px | Không tràn ngang; lưới tuần cuộn ngang trong khung riêng |

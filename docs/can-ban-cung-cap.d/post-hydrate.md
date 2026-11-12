## POST-HYDRATE — Quyền đọc nội dung bài của Page (Meta)

- **Cần gì:** xác nhận trên một Page thật rằng token Page hiện có đọc được `GET /{post-id}?fields=message,permalink_url,full_picture,created_time` (thường cần quyền `pages_read_engagement` của ứng dụng Meta, đã duyệt Advanced Access nếu Page ngoài vai trò của ứng dụng).
- **Vì sao:** mã làm theo tài liệu Graph API, dùng fixture; **chưa kiểm với Page thật**. Bài tạo từ webhook chỉ có mã ngoài; muốn inbox hiện nội dung bài và liên kết thì bước này phải chạy được.
- **Nếu thiếu quyền:** bước điền chỉ ghi cảnh báo `không lấy được nội dung bài từ nền tảng` kèm mã lỗi (vd `PERMISSION`/`TOKEN_EXPIRED`); ingest và bình luận KHÔNG hỏng, bài vẫn hiện với mã ngoài như trước.
- **Việc của chủ dự án:** bật `FB_CONNECTOR_ENABLED` ở môi trường có Page thật, gửi một bình luận mới vào bài chưa từng có trong hệ thống, xem bài có nội dung/liên kết không; báo lại mã lỗi trong log worker nếu không.

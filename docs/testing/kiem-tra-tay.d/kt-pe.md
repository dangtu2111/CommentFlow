## KT-PE — Thông báo đẩy + email (chờ nối giao diện/DB/nhà cung cấp thật)

Điều kiện: chưa kiểm tay được — cần `PUSH-EMAIL-STORE`, `PUSH-EMAIL-UI`, `PUSH-EMAIL-PROVIDERS`, khóa VAPID và SMTP thật.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Bật cờ `PUSH_EMAIL_ENABLED` ở staging, đăng ký thông báo đẩy trên trình duyệt, đặt giờ yên lặng 22:00–07:00 giờ Việt Nam. | Lưu được; tắt/mở từng sự kiện×kênh có hiệu lực. |
| 2 | Tạo mục cần người xử lý lúc 23:00. | Không có thông báo đến 07:00, sau đó nhận một thông báo (gom). |
| 3 | Làm hỏng token kênh thử lúc 23:00. | Nhận ngay đẩy + email; nội dung chỉ có nhãn chung + số lượng, không tên/SĐT/email khách. |

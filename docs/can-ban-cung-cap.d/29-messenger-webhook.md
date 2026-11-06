## 2d. Messenger (webhook `messages` + gửi tin) — `MESSENGER-WEBHOOK` (Xong-mock)

Code đã có chuẩn hóa webhook + bộ gửi + cửa sổ 24 giờ nhưng cờ `MESSENGER_CONNECTOR_ENABLED` **tắt mặc định** và chưa gọi Meta thật. Bạn cần cung cấp (chỉ khi muốn thử; dùng Page thử, không dùng Page khách):
- Quyền `pages_messaging` (cần **App Review** của Meta; Business Verification nếu Meta yêu cầu) cho Meta App ở mục 1.
- Trong Meta App → Webhooks → object **Page**: đăng ký thêm các field `messages`, `message_echoes` (cùng URL webhook hiện có); đăng ký lại `subscribed_apps` của Page thử với các field đó.
- Máy chạy worker: `MESSENGER_CONNECTOR_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS` (cùng giá trị với Facebook). Không commit giá trị.
- Còn thiếu phía code trước khi dùng thật: `MESSENGER-INGEST` (bảng hội thoại/tin nhắn + ghi sự kiện, cần migration) và `MSG-INBOX`. Kiểm tay: KT-MSW.

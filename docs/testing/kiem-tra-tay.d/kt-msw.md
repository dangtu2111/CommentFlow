## KT-MSW — Messenger với Page thật (MESSENGER-WEBHOOK, FR-014)

Điều kiện: Page thử có quyền `pages_messaging`, webhook đã đăng ký `messages` + `message_echoes`; worker chạy với `MESSENGER_CONNECTOR_ENABLED=true` trên môi trường thử; có `MESSENGER-INGEST`. **Chưa chạy được ở thời điểm Xong-mock.**

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Dùng tài khoản Facebook khác nhắn tới Page thử | Webhook tới (chữ ký đúng); tin hiện đúng hội thoại, đúng giờ (ms) |
| 2 | Trả lời trong 24 giờ từ ứng dụng | Khách nhận tin; gửi với `messaging_type=RESPONSE` |
| 3 | Chờ quá 24 giờ (hoặc đặt mốc giả ở staging), người gửi từ ứng dụng | Gửi được với `HUMAN_AGENT`; ghi lại nếu Meta từ chối (mã 10/subcode cửa sổ) |
| 4 | Như bước 3 nhưng AI tự gửi | Bị chặn trước khi gọi Meta |
| 5 | Nhân viên gõ tin trực tiếp ở Meta Inbox | Webhook echo tới, ghi `out`, không kích hoạt AI |
| 6 | Gửi webhook sai chữ ký | 401, không ghi sự kiện |

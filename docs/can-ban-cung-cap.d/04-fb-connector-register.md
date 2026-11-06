## 2c. Bật connector Facebook ở worker — `FB-CONNECTOR-REGISTER` (Xong-mock)

Code đã nối `createFacebookConnector` vào worker nhưng cờ **tắt mặc định**. Bạn cần cung cấp (chỉ khi muốn thử với Page thật; dùng Page thử, không dùng Page khách):
- Một Page thử đã kết nối qua `FB-OAUTH` (mục 1) — token Page nằm mã hóa trong DB.
- Trên **máy chạy worker** đặt biến: `FB_CONNECTOR_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET` (cùng Meta App ở mục 1), `TOKEN_ENC_KEYS` (cùng khóa với web). Không commit giá trị; chỉ tên biến có trong `env.example`.
- Điều kiện trước khi bật ở môi trường thật: `SEND-SWEEP`/`HIDE-SWEEP` đã merge (tránh yêu cầu kẹt `sending`). Kiểm tay: KT-FCR/KT-012.

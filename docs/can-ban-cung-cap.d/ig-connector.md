## 2v. Connector Instagram — `IG-CONNECTOR` (FR-013, Xong-mock)

Code connector Instagram đã nối vào worker nhưng cờ **tắt mặc định**, chưa từng gọi Meta thật (chỉ fixture theo tài liệu Meta). Để bật thật bạn cần cung cấp (dùng tài khoản thử, không dùng tài khoản khách):
- Một tài khoản **Instagram Business/Creator thử** liên kết với Page thử (mục 1, `FB-OAUTH`).
- Thêm quyền `instagram_basic` + `instagram_manage_comments` vào Meta App (cần App Review để dùng ngoài tài khoản Tester) và đăng ký webhook `instagram` → field `comments`.
- Trên **máy chạy worker** đặt `IG_CONNECTOR_ENABLED=true` cùng `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS` (cùng giá trị với mục 1). Không commit giá trị.
- Chưa bật được đường thật cho tới khi xong gap `IG-WEBHOOK-ROUTE` (route web nhận webhook Instagram) và `IG-CHANNEL-CONNECT` (lưu IG Business ID làm kênh) — cả hai cần migration/route do làn khác làm. Kiểm tay: KT-IG.

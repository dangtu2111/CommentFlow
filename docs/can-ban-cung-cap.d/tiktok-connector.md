## 2w. Connector TikTok — `TIKTOK-CONNECTOR` (FR-015, Xong-mock)

Code connector TikTok đã nối vào worker nhưng cờ **tắt mặc định**, chưa từng gọi TikTok thật (chỉ fixture viết tay theo tài liệu công khai). Để bật thật bạn cần cung cấp (dùng tài khoản thử, không dùng tài khoản khách):
- Đăng ký **TikTok API for Business** (developer), xin quyền đọc/trả lời bình luận organic; một **tài khoản TikTok Business thử**. Một số khu vực (EU, Anh, Thụy Sĩ…) bị loại; chưa rõ Việt Nam có được cấp không (Q5).
- Luồng OAuth TikTok lấy token tài khoản, lưu mã hóa như token Page — **chưa làm** (gap `TIKTOK-CHANNEL-CONNECT`, cần migration/route do làn khác).
- Trên **máy chạy worker** đặt `TIKTOK_CONNECTOR_ENABLED=true`, `TIKTOK_CLIENT_SECRET`, `TOKEN_ENC_KEYS` (cùng khóa với web). Không commit giá trị.
- Đối chiếu với tài khoản thật rồi sửa nếu lệch: tên endpoint/trường, mã lỗi, định dạng chữ ký webhook, có API ẩn bình luận hay không, giới hạn 150 ký tự/48 giờ. Kiểm tay: KT-TT.

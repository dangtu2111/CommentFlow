## CHANNELS-SYSTEM-USER — Tạo System User và token để kết nối Page thuộc Business (chủ dự án)

- **Khi nào cần:** Page nằm trong Business Portfolio và không hiện khi đăng nhập Facebook bằng tài khoản cá nhân (Meta không trả token Page cho tài khoản chỉ có quyền gián tiếp qua Business).
- **Cần gì:** quyền Admin của Business Portfolio sở hữu Page; Meta App của CommentFlow đã được thêm vào Business đó; web có `TOKEN_ENC_KEYS`, `FB_OAUTH_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET`.
- **Làm gì:** Business Settings → Người dùng → **Người dùng hệ thống** → thêm System User (vai trò Admin) → **Thêm tài sản** → Page → bật quyền quản lý nội dung/bình luận/tin nhắn → **Tạo token mới**, chọn ứng dụng CommentFlow, tick `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, chọn **không hết hạn**.
- **Dùng thế nào:** CommentFlow → Cài đặt → Kênh → Thêm kênh → khối "Page thuộc Business? Dùng token System User" → dán token. Không dán token vào chat, issue hay log; token bị lộ thì thu hồi trong Business Settings rồi tạo lại.
- **Lưu ý:** token được lưu mã hóa ở CommentFlow (một token mỗi workspace); nút "Ngắt token" xóa nó (các kênh đã kết nối vẫn chạy vì dùng token Page riêng). Xoay `TOKEN_ENC_KEYS` cần mã hóa lại token này (chưa có công cụ tự động — xem rủi ro trong `docs/plans/feat-channels-system-user.md`).

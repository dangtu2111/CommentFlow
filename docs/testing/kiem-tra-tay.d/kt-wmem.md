## KT-WMEM — Cài đặt › Thành viên & Phân quyền chạy thật (feat-wire-settings-members)

> Làm ở cả `vi` và `en`. Dùng **owner** (đã bật 2FA) và MỘT staff riêng (email chưa từng dùng); mở thư ở Mailpit.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner mở Cài đặt › Thành viên | Không có nút "Lưu thay đổi"/"Xem tài liệu"/"Sắp có"; bảng "Quyền truy cập theo vai trò" có hàng Thành viên, Kênh: Owner ✓, Staff ✗ |
| 2 | Mời email staff riêng, vai trò Staff | Thông báo trung tính; có dòng trong "Lời mời đang chờ"; Mailpit có thư mời |
| 3 | Bấm "Gửi lại" | Có thư mời thứ hai với liên kết KHÁC; liên kết cũ báo hết hiệu lực |
| 4 | Staff mở liên kết mới, đăng ký/đăng nhập, nhận lời mời | Staff vào workspace; không thấy mục Thành viên; `/app/members` trả 404 |
| 5 | Owner tải lại trang Thành viên | Staff xuất hiện, "Đang hoạt động", cột quyền hiện "Truy cập x/y mục" |
| 6 | Đổi Staff → Owner → Staff | Chip vai trò đổi đúng mỗi lần |
| 7 | Tạm khóa rồi Mở khóa | Trạng thái "Tạm khóa" (email ẩn) rồi "Đang hoạt động"; khi khóa, staff không vào được workspace |
| 8 | Hàng của chính mình | Khóa ("Không thể thay đổi") + liên kết "Rời workspace" → `/app/leave` báo Owner cuối cùng chưa thể rời, không có nút xác nhận |
| 9 | Mời thêm một email, bấm "Thu hồi" | Dòng biến mất; liên kết mời cũ báo không hợp lệ |
| 10 | Gỡ Staff (bấm "Gỡ khỏi workspace" rồi "Xác nhận gỡ") | Staff biến khỏi danh sách; staff mất quyền ngay; `/app/activity` của Owner có dòng đổi vai trò/gỡ |

## KT-UIS2 — Cài đặt khớp thiết kế (UI-FIDELITY-SETTINGS-V2, feat-ui-settings-v2)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Đăng nhập Owner, mở /app/settings ở 1440px | Đường dẫn "Cài đặt hệ thống › Tài khoản & Bảo mật"; cột trái có Kênh (n/n kênh), Thành viên (n người), Tài khoản & Bảo mật (nền màu chính); có thêm Gói & Thanh toán, Thông báo, Dữ liệu & Quyền riêng tư (xem KT-USP1) |
| 2 | Bấm Kênh rồi Thành viên ở cột trái | Cùng khung, mục tương ứng được tô; không còn thanh tab phía trên |
| 3 | Đăng nhập Staff, mở /app/settings | Cột trái chỉ có Tài khoản & Bảo mật |
| 4 | Bật 2FA xong, bấm "Tôi đã lưu các mã này" | Hiện banner xanh "Kích hoạt xác thực 2 bước thành công"; tải lại trang → banner biến mất |
| 5 | Ở hộp thoại mã dự phòng bấm "Tải file .txt" | Tải được file commentflow-backup-codes.txt chứa các mã |
| 6 | Đăng nhập trên 2 trình duyệt, ở trình duyệt A bấm "Đăng xuất tất cả thiết bị khác" | Trình duyệt B bị đăng xuất, A vẫn đăng nhập; danh sách phiên chỉ còn 1 |
| 7 | Mục "Tùy chọn hiển thị & Ngôn ngữ" | Đổi vi/en được; nút Giao diện Tối bị khóa kèm "Sắp ra mắt" |
| 8 | Thu cửa sổ còn 390px | Cột trái thành dải cuộn ngang; không cuộn ngang cả trang |

## KT-UITWS — Cài đặt dựng bằng Tailwind (UI-TW-SETTINGS, feat-tw-settings)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/dev/ui/settings` ở 1440px | Đường dẫn, tiêu đề, chip "2FA", cột trái 3/12 + thẻ 9/12; thẻ cách nhau 16px; giống `design/stitch/settings-security.png` |
| 2 | Bấm "Tạo lại mã" / "Đổi mật khẩu" / "Tắt 2FA" | Hộp thoại mở, nền mờ, Esc đóng; thanh độ mạnh 4 đoạn đổi theo mật khẩu mới; nút "Đổi thiết bị", "Xem lại mã", "Chỉnh sửa thông tin" mờ kèm "Sắp có" |
| 3 | Mở `/app/settings` (có phiên) | Dữ liệu thật; bật 2FA → quét QR → nhập mã → lưu mã dự phòng vẫn chạy; đổi mật khẩu xong về `/login` |
| 4 | Mở `/app/members` (Owner) | Thanh tab 6 mục, bảng thành viên + ma trận quyền + form mời + lời mời chờ; mời/gửi lại/thu hồi/đổi vai trò vẫn hoạt động |
| 5 | Mở `/app/settings/billing` (Owner) | Thẻ gói, 3 ô số liệu (lượt AI/kênh/nhân sự thật), 4 thẻ gói + thẻ mua thêm (nút "Sắp có"), QR, bảng hóa đơn |
| 6 | Thu cửa sổ 390px | Cột trái xuống trên nội dung, bảng cuộn ngang trong thẻ, không cuộn ngang cả trang |

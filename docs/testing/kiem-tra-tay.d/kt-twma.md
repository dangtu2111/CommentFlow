## KT-TWMA — Tin nhắn + Đăng nhập/Đăng ký/Lời mời dựng bằng Tailwind (UI-TW-MESSAGES-AUTH, feat-tw-messages-auth)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/dev/ui/messages` ở 1440px | Dải đầu trang + 4 cột (danh sách, hội thoại, hộp gợi ý/soạn, ngăn khách); dữ liệu gắn `[MẪU]`; nút chưa có chức năng mờ kèm "Sắp có"; giống `design/stitch/messages.png` |
| 2 | Mở `/login` rồi `/register` | Khung hai cột: panel giới thiệu + thẻ xác thực; đăng nhập/đăng ký vẫn chạy (cùng ô `email/password/name`); ô Tên shop, Ngành hàng, "Ghi nhớ" mờ kèm "Sắp có"; không có nút Google |
| 3 | Mở `/forgot-password`, `/reset-password`, `/login/2fa`, `/check-email`, `/verify-email` | Dựng cùng khung; gửi lại thư, nhập mã 2FA, lỗi theo ô vẫn hoạt động |
| 4 | Mở `/invite/<mã hợp lệ>` và `/dev/ui/auth-invite` | Trang thật chỉ hiện tên workspace + vai trò; trang mẫu có đủ khối người mời/kênh/thành viên gắn `[MẪU]` |
| 5 | Thu cửa sổ 390px | Panel giới thiệu xuống dưới/ẩn hợp lý, không cuộn ngang cả trang |

## KT-UIA — Giao diện xác thực khớp thiết kế (UI-AUTH, feat-ui-auth)

> Chỉ đổi giao diện, không đổi logic. / UI only, no logic change.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở /login ở 1440px | Panel trái có 3 huy hiệu, tiêu đề, thẻ minh họa nhãn [MẪU], ghi chú bảo mật; thẻ phải có tab, nút Facebook MỜ (tắt) + chú thích, đường kẻ "Hoặc tiếp tục bằng email", nút "Đăng nhập →". Không có huy hiệu/số liệu bịa, không có nút Google. |
| 2 | Mở /register | Cùng bố cục, tab "Đăng ký" đang chọn, nút "Tạo tài khoản →". |
| 3 | Thu cửa sổ còn 390px | Panel trái ẩn, thẻ đăng nhập vừa màn hình, không cuộn ngang. |
| 4 | Đổi ngôn ngữ sang English | Mọi chữ mới (nút Facebook, thẻ [SAMPLE], ghi chú) đã dịch. |
| 5 | Bật chế độ tối của hệ điều hành | Thẻ minh họa và panel vẫn đọc được (chữ không chìm). |
| 6 | Gõ sai mật khẩu rồi Enter | Vẫn hiện lỗi chung trên form như trước (logic không đổi). |
| 7 | Mở trang Nhật ký hoạt động (/app/activity) | Nhãn hành động hiện tiếng Việt ("Gửi lời mời"...) thay vì làm vỡ trang. |

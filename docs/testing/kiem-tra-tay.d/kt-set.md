## KT-SET — Trang Cài đặt (SETTINGS-PAGE, feat-settings-page)

Điều kiện: đã đăng nhập, có workspace. Làm bằng cả Owner và Staff.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở menu **Cài đặt** (cả Owner và Staff). | Vào `/app/settings`; không còn mục "Bảo mật" riêng; mục Cài đặt được tô đậm. |
| 2 | Xem trang. | Có thẻ xác thực 2 bước, danh sách phiên đăng nhập, thẻ ngôn ngữ. |
| 3 | Đăng nhập thêm trên trình duyệt khác rồi tải lại trang. | Thấy 2 phiên; phiên hiện tại có nhãn "Hiện tại", không có nút đăng xuất. |
| 4 | Bấm **Đăng xuất** ở phiên kia. | Phiên kia biến mất; trình duyệt kia bị đăng xuất. |
| 5 | Owner chưa bật 2FA mở `/app/settings`. | Bị chuyển tới `/app/security` có biểu ngữ bắt buộc; bật được 2FA ở đó. |
| 6 | Ở thẻ ngôn ngữ bấm **English**. | Toàn giao diện đổi sang tiếng Anh ngay; nút English khóa; lặp lại với Tiếng Việt. |

Nếu hỏng: ghi số bước và ảnh chụp.

---

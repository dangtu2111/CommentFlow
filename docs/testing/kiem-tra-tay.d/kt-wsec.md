## KT-WSEC — Cài đặt › Tài khoản & Bảo mật chạy thật (SETTINGS-SECURITY-WIRE, feat-wire-settings-security)

> Làm ở cả `vi` và `en` (đổi ở mục Ngôn ngữ). Dùng tài khoản mẫu **owner** (đã bật 2FA) và **staff**; mở thư ở Mailpit. Mock còn lại: chế độ Tối ("Sắp ra mắt"), số mã dự phòng còn lại, IP/vị trí phiên.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Staff mở `/app/settings` → Đổi mật khẩu, nhập SAI mật khẩu hiện tại | Báo "Mật khẩu chưa đúng", chưa đổi gì |
| 2 | Nhập đúng mật khẩu hiện tại + mật khẩu mới quá phổ biến (ví dụ `password1234`) | Báo mật khẩu quá phổ biến/đã lộ; chưa đổi |
| 3 | Nhập đúng + mật khẩu mới mạnh | Chuyển tới màn "Cập nhật mật khẩu thành công"; Mailpit có thư "Mật khẩu của bạn vừa được đổi" (có nút Đặt lại mật khẩu); mở `/app/settings` → về đăng nhập (mọi phiên đã xóa) |
| 4 | Đăng nhập staff bằng mật khẩu mới ở 2 trình duyệt; ở trình duyệt 1 mở `/app/settings` | Mục "Thiết bị đang đăng nhập" có 2 dòng (tên trình duyệt/hệ điều hành thật, thời điểm), dòng hiện tại có chip "Thiết bị này" |
| 5 | Bấm "Thu hồi" ở dòng còn lại | Dòng biến mất; làm mới trình duyệt 2 → bị đẩy về đăng nhập |
| 6 | Đăng nhập lại trình duyệt 2, rồi ở trình duyệt 1 bấm "Đăng xuất tất cả thiết bị khác" | Chỉ còn 1 dòng; trình duyệt 2 bị đăng xuất |
| 7 | Owner: thử Tắt 2FA | Không tắt được (bắt buộc với Owner/Admin) |
| 8 | Owner: "Tạo lại mã dự phòng" → nhập sai rồi đúng mật khẩu | Sai: báo lỗi. Đúng: mã mới hiện MỘT lần, có nút Tải .txt; mã cũ vô hiệu; tải lại trang không hiện lại mã |
| 9 | Đổi Ngôn ngữ sang English rồi quay lại Tiếng Việt; thử nút "Giao diện tối" | Giao diện đổi ngay và giữ sau khi đăng nhập lại; nút Tối mờ kèm "Sắp ra mắt" |
| 10 | Owner mở `/app/activity` | Có dòng "Đổi mật khẩu"/"Tạo lại mã dự phòng"/"Đăng xuất một thiết bị"… của đúng người thực hiện; chi tiết không có mật khẩu/mã/email |

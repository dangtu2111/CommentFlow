## KT-WPROF — Cài đặt › Tài khoản: hồ sơ, SĐT + OTP, chế độ tối, mã dự phòng, IP phiên (SETTINGS-PROFILE-WIRE, feat-wire-settings-profile)

> Làm ở cả `vi` và `en`. Dùng tài khoản mẫu **owner** (đã bật 2FA) ở môi trường dev/test. Cần bật `PHONE_VERIFY_ENABLED=true` (và `NEXT_PUBLIC_AVATAR_UPLOAD_ENABLED=true` nếu muốn thử ảnh); mã OTP là MOCK — xem ở log web dòng `[sms-mock] gửi tới +849 ••• ••• xxx: mã NNNNNN` (không có SMS thật). Chế độ Tối hiện chỉ áp cho khung Cài đặt.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `/app/settings` → "Chỉnh sửa thông tin": xóa trống họ tên rồi Lưu | Báo "Vui lòng nhập họ tên"; chưa lưu; ô Email mờ, không sửa được |
| 2 | Đổi họ tên + chọn múi giờ khác → Lưu thay đổi; tải lại trang | Tên mới hiện ở thẻ Tài khoản; mở lại hộp thoại thấy đúng múi giờ đã chọn; `/app/activity` (Owner) có dòng "Cập nhật thông tin cá nhân" không kèm giá trị |
| 3 | Trong hộp thoại: bấm "Đổi ảnh" chọn tệp .gif/.txt, rồi tệp PNG/JPG hợp lệ (cờ ảnh bật) | Tệp sai loại/ >2 MB bị báo lỗi; PNG/JPG hợp lệ báo "Đã cập nhật ảnh đại diện" (MOCK: ảnh chưa hiển thị vì chưa có nơi lưu). Cờ tắt: nút mờ kèm chú thích |
| 4 | Thẻ Tài khoản → "Xác minh số điện thoại"; nhập `12345` → Gửi mã | Báo số điện thoại không hợp lệ |
| 5 | Nhập `0912 345 678` → Gửi mã xác thực | Sang bước 2: hiện `+849 ••• ••• 678`, 6 ô OTP, đếm ngược "Gửi lại sau n giây"; nút Gửi lại mờ tới khi hết giờ |
| 6 | Nhập mã sai rồi mã đúng lấy từ log web | Sai: "Mã không đúng hoặc đã hết hạn"; đúng: bước 3 "Đã xác minh số điện thoại thành công" → Hoàn tất & Đóng |
| 7 | Tải lại `/app/settings` | SĐT hiện che giữa `+849 ••• ••• 678` kèm "Đã xác minh"; không đâu hiện đủ số |
| 8 | Nhập sai mã OTP 5 lần liên tiếp | Mã bị hủy; nhập đúng sau đó vẫn báo sai; phải xin mã mới (xin quá nhiều lần báo "thao tác quá nhanh") |
| 9 | Mục "Tùy chọn hiển thị": bấm Tối, tải lại; bấm Theo hệ thống rồi đổi chế độ tối/sáng của hệ điều hành và tải lại | Khung Cài đặt chuyển nền tối ngay khi tải (không nháy sáng); Theo hệ thống bám cài đặt của máy; Sáng trở lại bình thường |
| 10 | Xem thẻ Xác thực 2 bước và "Thiết bị đang đăng nhập" | Ô "Mã dự phòng còn lại" ghi đúng `n/10` (giảm sau khi dùng một mã dự phòng khi đăng nhập); mỗi phiên có dòng "IP: 113.161.x.x" (đã che) hoặc "không xác định"; không có dòng chứng nhận (ISO…) nào |

## KT-FBSU — Kết nối Page thuộc Business bằng token System User (channels-system-user)

> Làm ở cả `vi` và `en`, bằng tài khoản Owner. Cần: `FB_OAUTH_ENABLED=true`, `TOKEN_ENC_KEYS`; một System User đã gán Page thuộc Business và token (xem `docs/can-ban-cung-cap.d/channels-system-user.md`). Bước 1–3 làm được không cần Meta thật.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `/app/channels?fb=select&src=system` khi chưa lưu token | Hộp thoại mở, danh sách trống, khối "Dùng token System User" đang mở với ô dán dạng password |
| 2 | Dán chuỗi bất kỳ ngắn (`abc`) → Lưu | Thông báo "Token không đúng định dạng"; không có gì được lưu |
| 3 | Đăng nhập bằng Staff rồi mở cùng URL | 404/không vào được (chỉ Owner) |
| 4 | Dán token System User đúng → "Lưu token và liệt kê Page" | Chuyển sang bước chọn Page, thấy Page được gán (ví dụ KIM TAM); trang không hiển thị lại token |
| 5 | Tick Page → "Xác nhận & Kết nối" | Kênh được tạo; webhook đăng ký; quyền hiện đủ ở Kênh |
| 6 | Mở lại Thêm kênh → "Liệt kê Page bằng token đã lưu" | Liệt kê được mà không phải dán lại |
| 7 | "Ngắt token" | Báo đã ngắt; ô dán trở lại; kênh đã kết nối vẫn hoạt động |
| 8 | Thu hồi token ở Business Settings rồi dùng lại token đã lưu | Báo token không dùng được, trạng thái chuyển "cần dán token mới" |

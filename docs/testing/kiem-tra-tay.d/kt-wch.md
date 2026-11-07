## KT-WCH — Cài đặt › Kênh đã kết nối, mã dự phòng, tab chung (feat-settings-channels-hub)

> Làm ở cả `vi` và `en`. Dùng tài khoản Owner (dev: `/dev/login` khi bật `DEV_AUTO_LOGIN=1`). Bước 5–6 cần worker chạy với `FB_CONNECTOR_ENABLED=true` và một Page thật đã kết nối (hoặc chỉ xem thông báo "Chưa kiểm được" khi connector tắt). Đã chạy `pnpm --filter @flow/worker queue:install` một lần.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở lần lượt 6 tab Cài đặt (Kênh, Thành viên, Gói, Thông báo, Dữ liệu, Tài khoản) | Mọi tab cùng thanh tab ngang; tiêu đề + mô tả cùng kiểu, có tên workspace |
| 2 | `/app/channels`: xem 4 thẻ số liệu và từng kênh | Số kênh, tương tác 24 giờ, % AI tự trả lời khớp dữ liệu; mỗi kênh có "Bình luận 24 giờ qua" và "Bình luận gần nhất"; không có số liệu bịa |
| 3 | Kênh › "Cài đặt nâng cao": đổi ngôn ngữ trả lời sang English → Lưu | Banner "Đã lưu…"; mở lại thấy English; đổi lại "Tự nhận" |
| 4 | Bấm "Thêm kênh mới" (cờ `FB_OAUTH_ENABLED=true`) → đăng nhập Facebook → chọn Page | Page hiện trong nhóm Facebook; vượt giới hạn gói báo "limit" |
| 5 | Bấm "Kiểm tra toàn bộ kết nối" | Banner "Đã gửi yêu cầu kiểm tra"; bấm lại ngay → "vừa kiểm tra xong, đợi ~1 phút"; sau vài giây tải lại: mỗi kênh có "Kết nối ổn định · Kiểm tra lúc …" |
| 6 | Với Page đã gỡ quyền/token hỏng: kiểm tra lại | Kênh chuyển "Hết hạn/Đã ngắt", banner đỏ + nút "Cấp lại quyền OAuth"; kênh khác không bị ảnh hưởng |
| 7 | Kênh › nút ngắt kết nối → xác nhận | Kênh thành "Đã ngắt"; nhật ký `/app/activity` có "token cleared"; bấm "Kết nối lại" vẫn dùng được |
| 8 | Tài khoản › thẻ mã dự phòng: "Xem lại mã" → nhập sai rồi đúng mật khẩu | Sai: báo lỗi; đúng: hiện các mã còn dùng + nút chép/tải; nhật ký ghi "Xem lại mã dự phòng" (không kèm mã) |
| 9 | "Tải file .txt" → nhập mật khẩu đúng | Tự tải file `.txt` chứa đúng các mã còn lại |
| 10 | Staff mở `/app/channels` | 404 (chỉ Owner) |

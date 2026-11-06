## KT-AMU — Cài đặt tự gửi (AUTO-MATRIX-UI, FR-070/071, feat-auto-matrix-ui)

> Cấu hình lưu bền trong DB (migration 0047, feat-auto-config-store; cần DB đã migrate) nhưng chưa áp dụng cho việc gửi thật. Cần ≥ 1 kênh để thấy ma trận.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập Owner, mở menu **Cài đặt tự gửi** (vi) | Trang `/app/automation`; dòng lưu ý "chưa áp dụng…"; mọi ô ma trận là **Tắt**; ngưỡng 85, trễ 1 phút, 50 câu/ngày |
| 2 | Đặt Hỏi giá × Bình luận = **Tự động**, Hỏi giá × Tin nhắn = **Chạy thử**, bấm **Lưu cài đặt** | Về trang với "Đã lưu cài đặt."; hai ô giữ giá trị vừa chọn |
| 3 | Nhập ngưỡng 79 rồi lưu | Báo lỗi "Ngưỡng tin cậy phải từ 80 đến 100.", không đổi gì đã lưu |
| 4 | Bật giờ hoạt động, bỏ hết ngày, lưu | Báo lỗi giờ hoạt động |
| 5 | Nhập từ khóa chặn "ship" và "giảm giá" (mỗi dòng một từ), chữ ký "— Trợ lý AI", lưu | Đã lưu; tải lại trang vẫn thấy hai từ khóa và chữ ký |
| 6 | Đổi sang English | Menu "Auto-send settings", mọi nhãn/lỗi bằng tiếng Anh |
| 7 | Đăng nhập Staff, mở `/app/automation` | 404; menu không có mục này |
| 8 | (KT-ACS, feat-auto-config-store) Khởi động lại máy chủ web rồi mở lại trang bằng Owner | Mọi giá trị đã lưu ở bước 2–5 vẫn còn; dòng "lần sửa cuối" hiện đúng người + giờ |
| 9 | Với hai workspace khác nhau, lưu hai cấu hình khác nhau | Mỗi workspace chỉ thấy cấu hình của mình |

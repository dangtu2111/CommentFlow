## KT-SPR — Quy tắc spam + xem trước 7 ngày (SPAM-RULES, FR-080, US-050, feat-spam-rules)

> Cần có vài bình luận trong 7 ngày qua (từ Page thử). / Needs a few comments from the last 7 days (test Page).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner → menu **Quy tắc spam**; Staff gõ thẳng `/app/spam-rules` | Owner thấy trang; Staff nhận 404 và không có mục menu |
| 2 | Loại **Từ khóa**, mẫu `zalo, vay tiền`, **Xem trước 7 ngày** | Hiện "Khớp X trên Y bình luận…" và tối đa 5 ví dụ; SĐT/email trong ví dụ bị che |
| 3 | Loại **Số điện thoại** (mẫu trống) → Xem trước | Chỉ bình luận có SĐT di động VN được đếm; bình luận của chính Page không tính |
| 4 | Loại **Regex**, mẫu `(a+)+$` | Báo "Quy tắc chưa hợp lệ" (regex lặp lồng nhau bị từ chối) |
| 5 | Mở danh sách Hành động | Chỉ có "Chỉ đánh dấu" và "Bỏ qua"; không có Tự ẩn |
| 6 | Bấm **Lưu quy tắc** (cần DB đã migrate 0050, feat-spam-rules-store) | Báo "Đã lưu"; hàng mới ở `cf.rules` (`enabled` = true, `created_by` = Owner); không bình luận nào bị đổi |
| 7 | Đổi ngôn ngữ en | Mọi chuỗi trang đã dịch |
| 8 | Lưu thêm cho đủ 50 quy tắc rồi lưu quy tắc thứ 51 | Báo "Đã đủ 50 quy tắc…"; không có hàng thứ 51 |

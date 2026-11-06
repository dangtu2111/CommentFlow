## KT-UIHLR — Khách tiềm năng, Báo cáo, Nhật ký dựng từ HTML Stitch (UI-HTML-LEADS-REPORTS, feat-ui-html-leads-reports)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Đăng nhập Owner, thanh bên có "Khách tiềm năng" và "Báo cáo"; mở /app/leads | 4 ô số + Kanban 4 cột (Mới, Đang tư vấn, Đã chốt, Hủy) có số đếm; workspace chưa có lead → dải thông báo "Chưa có khách tiềm năng" |
| 2 | Xem một thẻ lead (khi đã có dữ liệu) | Chỉ hiện chữ viết tắt, tên, nguồn (Bình luận/Tin nhắn), 4 số cuối SĐT dạng "•••• 1234"; không có SĐT/email đầy đủ |
| 3 | Mở /app/reports, bấm "30 ngày qua" | URL có `?range=30`; số liệu đổi; biểu đồ 24 cột theo giờ, giờ cao điểm đậm hơn |
| 4 | Đăng nhập Staff, mở /app/reports | Chỉ có "Bạn đã trả lời", "Trả lời trong 15 phút", "Thời gian phản hồi"; không có tỷ lệ cả workspace, AI tự gửi, bảng nhân viên |
| 5 | Mở /app/activity | Danh sách là bảng Thời gian · Tác nhân · Hành động · Đối tượng; bấm giờ ở một dòng → ngăn chi tiết bên phải, dòng đó được tô nền |
| 6 | Thu cửa sổ còn 390px ở cả ba trang | Không tràn ngang; bảng cuộn ngang trong khung riêng |
| 7 | Chuyển English | Mọi chữ đổi sang tiếng Anh, không còn khóa thô (ví dụ `reports.title`) |

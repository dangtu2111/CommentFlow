## KT-ATB — Ô Thử AI chạy cả pipeline, không trừ lượt (AI-TRY-BOX-UI, FR-059, FR-029, US-034, feat-ai-try-box-ui)

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập Owner → menu **Thử AI** (`/app/try-ai`); đăng nhập Staff → không có mục, gõ thẳng URL | Owner thấy trang + dòng "bản mô phỏng"; Staff nhận 404 |
| 2 | Gõ "ship về Hà Nội bao nhiêu" → Thử | Nhãn Xin tư vấn, nguồn "Phí vận chuyển" kèm điểm, câu trả lời có 20.000đ, "Được tự gửi (nếu Owner bật…)", dòng "không trừ lượt" |
| 3 | Gõ "áo thun basic size M màu đen giá bao nhiêu" | Cách tìm nguồn = tra bảng sản phẩm; nguồn "Áo thun basic" giá 150.000đ |
| 4 | Gõ "hàng lỗi, tôi muốn hoàn tiền" | Nhãn Khiếu nại, hành động Chuyển nhân viên, "Không tự gửi vì: cần nhân viên…" |
| 5 | Gõ "😀😀" | Thông báo AI bỏ qua, không trừ lượt |
| 6 | Gõ SĐT trong bình luận rồi kiểm nội dung hiển thị | Không có SĐT thô trong nguồn/câu trả lời |
| 7 | Bấm Thử quá 30 lần trong ngày | Thông báo hết lượt thử hôm nay; số lượt AI của gói (trang Gói/hạn mức sau này) không đổi |
| 8 | Đổi ngôn ngữ giao diện sang English | Mọi chữ trên trang đổi sang tiếng Anh |

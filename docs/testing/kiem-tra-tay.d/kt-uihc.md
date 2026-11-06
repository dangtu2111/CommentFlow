## KT-UIHC — Hộp thư Bình luận khớp HTML Stitch (UI-HTML-COMMENTS, feat-ui-html-comments)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/dev/ui/comments` ở 1440px | Thanh trên cao 64px, thanh bên 256px; dải phụ 44px; ba cột 224/384/phần còn lại, mỗi cột cuộn riêng, trang không cuộn |
| 2 | Cột trái | 12 tab trạng thái có chấm màu + số (tab chọn nền màu chính), nền tảng 2×2, 6 nhãn AI (chú giải), công tắc "Chỉ bài quảng cáo" |
| 3 | Bấm công tắc quảng cáo và một nền tảng | URL đổi (`ads=1`, `platform=…`), danh sách lọc theo; tab đang chọn được giữ |
| 4 | Cột giữa | Ô tìm + nút lọc (mở chọn kênh), dòng "Sắp xếp: …" bấm đổi chiều, thẻ có thanh trái khi đang chọn, chân "Hiển thị n / tổng" |
| 5 | Chọn một bình luận | Cột phải hiện thẻ bối cảnh, khách + bình luận, AI phân tích (nhãn, Đổi nhãn), ô trả lời AI; thanh dưới có Ẩn và Gửi kèm `Ctrl + Enter` dính đáy khi cuộn |
| 6 | Gõ trả lời rồi bấm Ctrl+Enter | Gửi như trước (không đổi logic) |
| 7 | Thu cửa sổ còn 390px | Hai ngăn (danh sách / chi tiết) đúng; không cuộn ngang cả trang |

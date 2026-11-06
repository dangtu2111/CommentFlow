## KT-UITWC — Hộp thư Bình luận dựng bằng Tailwind (UI-TW-COMMENTS, feat-tw-comments)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/dev/ui/comments` ở 1440px và 1920px | Dải phụ 44px; ba cột 224/384/phần còn lại, mỗi cột cuộn riêng, trang không cuộn; giống `design/stitch/comments.png` |
| 2 | Cột trái | Tab trạng thái có chấm/biểu tượng + số, tab chọn nền màu chính; nền tảng 2×2; 6 nhãn AI; công tắc "Chỉ bài quảng cáo" bật/tắt được; thẻ "Độ chính xác AI" |
| 3 | Chọn một bình luận | Thẻ bối cảnh, khách, AI phân tích, ô trả lời AI; thanh dưới (Ẩn · Bỏ qua · Nhắn riêng · Gửi) dính đáy khi cuộn; nút "Sắp có" mờ, con trỏ cấm |
| 4 | Thu cửa sổ còn 390px | Hai ngăn (danh sách / chi tiết), có liên kết quay lại, không cuộn ngang |
| 5 | Mở `/app/comments` (có phiên) | Hiển thị dữ liệu thật như trước; gõ trả lời + Ctrl+Enter vẫn gửi; chọn nhiều (J/K/X) vẫn hoạt động |
| 6 | Mở các màn khác (Bài viết, Nhật ký, Cài đặt) | Không đổi hình dạng (CSS dùng chung `aria-disabled`/kit còn nguyên) |

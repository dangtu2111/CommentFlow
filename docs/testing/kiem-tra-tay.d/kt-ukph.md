## KT-UKPH — Giao diện Cơ sở kiến thức + Bài viết dựng từ HTML Stitch (feat-ui-html-kb-posts)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner mở `/app/kb` | Thanh lệnh có tiêu đề, nút "Chạy kiểm thử"/"Xuất bản", thanh Độ đầy đủ khớp trang Độ sẵn sàng; cột rail 2 nhóm bên trái |
| 2 | Lần lượt mở Nhập Excel, Thử AI, Độ sẵn sàng, Lỗ hổng, Xuất bản, Bộ kiểm thử | Cả 6 trang cùng khung và cột rail; mục hiện tại tô màu chính; không có số liệu giả |
| 3 | Thu cửa sổ dưới 800px | Rail thành hàng nhãn xếp ngang phía trên, không tràn ngang |
| 4 | Mở `/app/posts` | Đường dẫn 3 cấp, chip số bài, khung lọc, thẻ bài có vạch nhấn (đỏ khi còn bình luận chờ) |
| 5 | Mở `/dev/ui/kb` và `/dev/ui/kb-posts` (chỉ dev) | Hiện dữ liệu [MẪU]; production trả 404 |
| 6 | Xem nguồn trang trong DevTools, tab Network | Phông Be Vietnam Pro tải từ chính ứng dụng, không có yêu cầu tới `fonts.googleapis.com`/`gstatic` |

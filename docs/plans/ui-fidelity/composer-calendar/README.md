# Đối chiếu giao diện — Biên tập bài viết và Lịch đăng (COMPOSER-CALENDAR-UI)

Thiết kế gốc: `design/stitch/composer.html` ("Biên tập bài viết & Gắn sản phẩm AI - Post Composer Studio"), `design/stitch/calendar.html` ("Lịch phát hành bài viết & Quản trị lịch đăng - Social Calendar"). Ảnh trang thật (Owner mẫu `[MẪU]`, dev) ở thư mục này: `composer-1440/390.png`, `calendar-1440/390.png`, `calendar-drawer-1440/390.png`. Chụp bằng `e2e/support/shot-real.mjs` và `e2e/support/shot-calendar-drawer.mjs`. Không tràn ngang ở cả 1440px và 390px.

## Điểm lệch có chủ ý so với thiết kế (Q-CMP1)

| Thiết kế | Bản dựng | Lý do |
|---|---|---|
| Kênh mẫu "Fanpage An Nhiên / Instagram Store / TikTok Shop" | Kênh THẬT của workspace; kênh hết hạn bị khóa | Không bịa dữ liệu |
| Hashtag gợi ý, "Độ dài hoàn hảo cho thuật toán Feed", "Khung giờ vàng", "AI Analytics Đề xuất" | Bỏ | Không có dữ liệu/phân tích thật |
| Nội dung bài mẫu, ảnh mẫu, "4 tệp", thẻ gắn sản phẩm (Áo Thun 199.000đ…) | Trạng thái rỗng + nút vô hiệu "Sắp có" | Chưa có tải media, chưa gắn sản phẩm cho bài đăng |
| "AI Bot Đã Sẵn Sàng 100%", "Đạt chuẩn chính sách thương mại Meta", dung lượng 4.2 MB | Bỏ | Không có số đo/kiểm duyệt thật |
| Lưu nháp / Lên lịch / Đăng ngay | Vô hiệu; biểu ngữ nói rõ nội dung gõ chưa được lưu hay gửi đi | Chưa có bảng bài lên lịch, chưa đăng được lên Facebook (cần quyền Meta `pages_manage_posts`) |
| Lịch: KPI "+12% mo/mo", "Mục tiêu 50 bài", "96% độ tin cậy", "AI v2.4", bài/khung giờ mẫu | KPI THẬT của tuần (số bài, bình luận, bình luận chờ); bài THẬT trong tuần; ô trống ghi "Không có bài" | Không có dữ liệu thật cho các số kia |
| Lịch tuần/tháng + Bảng biểu + Kanban | Chỉ lịch tuần; hai kiểu còn lại vô hiệu "Sắp có" | Chưa có dữ liệu bài lên lịch/bản nháp |
| Bộ lọc trạng thái và "Sản phẩm AI", "Đồng bộ bài mới", "Xuất file" | Chỉ lọc nền tảng | Các bộ lọc kia chưa có dữ liệu |
| Khung chi tiết: số tiếp cận, SKU, kịch bản AI đang áp dụng | Kênh, giờ đăng, nội dung, ảnh, số bình luận/chờ xử lý, liên kết bài gốc và bình luận; "Hủy lịch"/"Chỉnh sửa" vô hiệu | Chỉ dữ liệu thật của bài |
| Biểu tượng Material Symbols | SVG nội tuyến qua `Icon` (thêm 11 biểu tượng bằng `fetch-material-icons.mjs`) | CSP không cho phông ngoài |

## Chưa đo bằng `pnpm ui:fidelity`

Chưa chạy bảng lệch hình học (cần mạng để HTML Stitch nạp Tailwind CDN và `data-landmark` cho phần tử mốc). Đã so mắt bố cục/nhãn/màu theo ảnh Stitch; cần đo hình học nếu muốn khớp từng pixel.

## KT-WKB — Cơ sở kiến thức: Nguồn dữ liệu + nhập tay (feat-kb-wire-content)

> Làm ở cả `vi` và `en`. Dùng tài khoản Owner (dev: `/dev/login`). Staff không thấy mục Cơ sở kiến thức.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/app/kb` | Khối Shopify "Chưa kết nối" (nút Sắp có), 3 ô số liệu (sản phẩm, chính sách, FAQ) khớp dữ liệu; bảng nguồn URL đúng; xem trước một sản phẩm thật (giá, tồn) |
| 2 | Nhìn thanh trái | Có Thông tin cửa hàng, Nhập sản phẩm, Chính sách, Hỏi – đáp, Câu chưa trả lời, Giọng văn…; "Tài liệu", "Quy tắc & Giới hạn", "Từ điển viết tắt" mờ, không bấm được |
| 3 | `/app/kb/faq`: thêm câu hỏi + câu trả lời + thẻ "ship, Giao hàng" | Báo "Đã lưu"; thẻ lưu chữ thường `ship, giao hàng`; số FAQ ở `/app/kb` tăng 1 |
| 4 | Sửa câu trả lời của mục vừa thêm → Lưu; rồi Xóa | Lần lưu giữ đúng nội dung mới; xóa báo "Đã xóa" và mục biến mất |
| 5 | `/app/kb/policies`: thêm chính sách (loại, ngôn ngữ, tiêu đề, nội dung); thử nội dung chỉ có dấu cách | Nội dung rỗng bị từ chối; hợp lệ thì hiện thẻ có loại + ngôn ngữ; Xóa được |
| 6 | `/app/kb/shop`: nhập tên, website `javascript:x` rồi `https://...` | `javascript:` bị từ chối ("chưa hợp lệ"); https lưu được; có thể thêm bản cho ngôn ngữ khác |
| 7 | `/app/kb/voice` (tiếng Việt): giọng điệu, quy tắc (mỗi dòng một quy tắc), xưng "Tên riêng" bỏ trống tên shop | Thiếu tên shop bị từ chối; điền tên thì lưu được |
| 8 | Voice: nhập chỉ một câu cho chủ đề Giảm giá, đủ hai câu cho Vận chuyển → Lưu | Chỉ Vận chuyển được lưu; ô Giảm giá trống sau khi tải lại |
| 9 | `/app/kb` › "Mở Chạy thử" | Sang trang Thử AI như cũ |
| 10 | Staff mở thẳng `/app/kb/faq` | 404 (chỉ Owner) |

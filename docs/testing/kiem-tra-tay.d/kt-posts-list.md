## KT-POSTS-LIST — Danh sách bài viết (POSTS-LIST, feat-posts-list)
Điều kiện: staging có ít nhất 1 kênh với vài bài (sau khi webhook/polling nhận bình luận); đăng nhập Owner và Staff.
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở menu "Bài viết" (`/app/posts`) | Thấy danh sách bài, tổng số, số bình luận và số chờ xử lý; bài chưa có nội dung hiện mã bài |
| 2 | Lọc nền tảng / kênh / loại bài, bấm Áp dụng | Danh sách và tổng số thu hẹp đúng; "Xóa bộ lọc" trả về tất cả |
| 3 | Tìm "váy" (không dấu: "vay") và một mã bài | Khớp không phân biệt dấu/hoa thường; ký tự % và _ không làm khớp lung tung |
| 4 | Đổi sắp xếp "Mới đăng nhất"; sang trang sau/trước | Thứ tự đúng; trang cuối ít bài; URL giữ bộ lọc |
| 5 | Đổi ngôn ngữ sang English | Mọi chữ trên trang đổi sang tiếng Anh |
| 6 | Đăng nhập tài khoản thuộc workspace khác | Không thấy bài của workspace này |

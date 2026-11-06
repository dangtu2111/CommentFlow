## KT-KBIX — Nhập sản phẩm từ Excel/CSV (KB-IMPORT-EXCEL, FR-051, US-003, feat-kb-import-excel) · Import products from Excel/CSV

Chuẩn bị: một file `.xlsx` và một `.csv` nhỏ (cột: Tên sản phẩm, SKU, Giá bán, Tồn kho, Màu, Size), thêm 1 dòng thiếu tên, 1 dòng giá `abc`, 1 ô `=1+1`; một file `.xls`/`.png` đổi đuôi `.csv`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập Owner → menu **Nhập sản phẩm** (`/app/products/import`); đăng nhập Staff → không có mục, gõ thẳng URL | Owner thấy trang; Staff nhận 404 |
| 2 | Chọn file `.csv` → **Đọc file** | Bảng khớp cột tự gợi ý đúng (Tên→Tên sản phẩm, Giá bán→Giá, Màu/Size→Thuộc tính); có vài dòng mẫu |
| 3 | Xem "Kết quả kiểm tra" | Báo đúng dòng/cột lỗi: thiếu tên, giá không hợp lệ, ô công thức bị chặn; số dòng hợp lệ đúng |
| 4 | Đổi cột "Màu" sang "Bỏ qua" → **Kiểm tra lại** | Số liệu cập nhật; chưa có sản phẩm nào được tạo (kiểm danh sách sản phẩm/DB) |
| 5 | **Xác nhận nhập** | Thông báo số sản phẩm/biến thể mới; dòng lỗi được bỏ qua |
| 6 | Nhập lại đúng file đó | Báo "cập nhật", không tạo trùng |
| 7 | Chọn file `.xlsx` (có một ô công thức) | Đọc được; ô công thức bị báo lỗi, không dùng giá trị đã tính |
| 8 | Chọn file giả đuôi `.csv`/file > 10 MB/file `.xls` | Thông báo lỗi rõ ràng, không có gì được nhập |
| 9 | Đổi ngôn ngữ giao diện sang English | Mọi chữ trên trang và thông báo lỗi đổi sang tiếng Anh |

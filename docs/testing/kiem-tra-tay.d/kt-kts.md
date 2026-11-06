## KT-KTS — Bộ câu kiểm thử kiến thức (KB-TESTSET, FR-054, US-034, feat-kb-testset)

> Chạy bằng mô phỏng, không cần khóa/DB. Bộ câu chưa được lưu và chưa chặn nút Xuất bản. / Runs on the simulation; the set is not saved and does not block Publish.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner → menu **Câu kiểm thử**; Staff gõ thẳng `/app/kb-testset` | Owner thấy trang với 3 dòng mẫu; Staff nhận 404 và không có mục menu |
| 2 | Bấm **Chạy bộ câu kiểm thử** với dòng mẫu | "Đạt 3/3", thông báo cổng Đạt, mỗi câu hiện Mong đợi/Thực tế |
| 3 | Đổi dòng đầu thành `ship về Hà Nội bao nhiêu \| handoff` → chạy | Câu 1 "Không đạt — Hành động khác mong đợi"; cổng "Chưa đạt" |
| 4 | Thêm từ khóa không có (`... \| redirect \| abcxyz`) → chạy | Câu báo "Thiếu từ khóa: abcxyz" |
| 5 | Xóa hết chữ rồi chạy; nhập dòng không có `\|`; nhập hành động `hide` | Báo lỗi tiếng Việt, dòng sai được nêu số dòng; không tốn số lần chạy |
| 6 | Nhập 21 dòng hợp lệ | Báo "Quá nhiều câu (tối đa 20 dòng…)" |
| 7 | Chạy 11 lần trong một ngày | Lần 11 báo hết số lần chạy hôm nay |
| 8 | Đổi ngôn ngữ en | Mọi chuỗi trang, menu "Test questions" đã dịch |

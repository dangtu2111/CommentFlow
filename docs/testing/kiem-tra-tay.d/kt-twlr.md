## KT-TWLR — Khách tiềm năng, Nhật ký, Báo cáo dựng bằng Tailwind (UI-TW-LEADS-REPORTS, feat-tw-leads-reports)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở /dev/ui/leads ở 1440px | Đầu trang + 3 nút, 4 thẻ số liệu, thanh lọc (ô tìm, Kanban/Danh sách, 4 bộ lọc), 4 cột Kanban 8 thẻ mẫu, ngăn chi tiết bên phải; mọi nút/ô chưa dùng được mờ, di chuột hiện "Sắp có" |
| 2 | Mở /app/leads trên môi trường không phải dev | Không thấy số liệu/tên mẫu: thẻ số liệu hiện "—"; thẻ khách chỉ có tên, nguồn, "•••• 1234", giờ |
| 3 | Mở /dev/ui/reports | Đầu trang (nút ngày), 5 thẻ số liệu, biểu đồ cột xếp chồng, vành khuyên ý định, biểu đồ theo giờ, bảng top bài viết, thẻ nhân viên, hộp đề xuất; khối mẫu có nhãn [MẪU] |
| 4 | /app/reports, bấm "7 ngày qua" rồi "30 ngày qua" | URL đổi `?range=`; nút đang chọn tô nền trắng; số liệu thật đổi |
| 5 | Staff mở /app/reports | Không có thẻ nhân viên toàn đội; số AI hiện "—" |
| 6 | Mở /app/activity, lọc theo hành động rồi bấm "Chi tiết" một dòng | URL đổi; dải "Đang áp dụng" liệt kê bộ lọc; ngăn bên phải hiện thời điểm, người thực hiện, bảng trước/sau thật |
| 7 | Thu cửa sổ 390px cả ba trang; chuyển English | Không tràn ngang (bảng cuộn trong khung); không còn khóa thô |

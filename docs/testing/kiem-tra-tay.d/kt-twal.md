## KT-TWAL — Tự động hóa, Quy tắc spam, Landing, Quyền riêng tư, Điều khoản dựng bằng Tailwind (UI-TW-AUTOMATION-LEGAL, feat-tw-automation-legal)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở /dev/ui/automation ở 1440px | Thanh đầu trang (trạng thái, lọc kênh, Dừng khẩn cấp mờ "Sắp có"), thanh tab, 4 thẻ số liệu [MẪU], ma trận kênh × nhãn, kiểu trả lời (mờ), ngưỡng an toàn, thanh lưu |
| 2 | Chủ shop mở /app/automation, đổi một ô sang "Tự động", chỉnh ngưỡng/từ khóa, bấm Lưu | Có thông báo "Đã lưu"; tải lại vẫn giữ giá trị; mọi ô mặc định "Tắt"; Staff nhận 404 |
| 3 | Mở /dev/ui/spam-rules rồi bấm tab "Bình luận đã bị ẩn" | 4 thẻ số liệu, 4 thẻ quy tắc [MẪU] (công tắc/nút mờ), trình thiết lập; tab Nhật ký có thanh công cụ, bảng 3 dòng, phân trang (mọi nút mờ) |
| 4 | /app/spam-rules: tạo quy tắc, bấm Xem trước | Hộp Dry-run hiện số bình luận khớp 7 ngày; Lưu thành công; "Tự động ẩn" vẫn mờ "Sắp có" |
| 5 | Mở /dev/ui/landing, /dev/ui/privacy, /dev/ui/terms | Đủ các khối của thiết kế, chữ [MẪU]/"chờ duyệt pháp lý"; không có "Meta Tech Partner", số shop, giá, chứng nhận; liên kết điều hướng giữa 3 trang chạy |
| 6 | Thu cửa sổ 390px cả 5 trang | Không tràn ngang (bảng cuộn trong khung) |

## KT-UIC — Tự động hóa + Quy tắc spam đủ thành phần (UI-COMPLETE-AUTO-SPAM, feat-ui-complete-automation-spam)

> Xem trên bản dev (`APP_ENV=dev`) hoặc `/dev/ui/automation`, `/dev/ui/spam-rules`. Dữ liệu `[MẪU]` không phải số thật.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/app/automation` với tài khoản Owner (dev) | Có: đầu trang + trạng thái "Đang chạy ở N/M kênh", 5 tab, 4 thẻ số liệu `[MẪU]`, ma trận kênh × nhãn (Khiếu nại/Spam khóa "Không hỗ trợ"), Kiểu trả lời, Ngưỡng an toàn, thanh lưu |
| 2 | Kéo thanh ngưỡng, thêm/bỏ từ khóa chặn, tắt công tắc chữ ký rồi bấm Lưu cài đặt | Huy hiệu đổi theo giá trị; sau lưu: ngưỡng/từ khóa đúng như đã chọn, chữ ký bị xóa |
| 3 | Bấm Dừng khẩn cấp, Khôi phục mặc định, các radio Kiểu trả lời | Đều vô hiệu, có "Sắp có" |
| 4 | Mở `/app/spam-rules` | Có: đường dẫn, nguyên tắc an toàn, 4 thẻ, 2 tab, 4 thẻ quy tắc `[MẪU]` (công tắc vô hiệu), trình thiết lập |
| 5 | Chọn tab "Bình luận đã bị ẩn" | Thanh công cụ + bảng + phân trang (mẫu), mọi nút vô hiệu |
| 6 | Tạo quy tắc từ khóa → Xem trước 7 ngày → Lưu quy tắc | Xem trước hiện số khớp thật; lưu như trước đây |
| 7 | Thu hẹp cửa sổ 390px | Không cuộn ngang cả trang |
| 8 | Mở trang trên staging/production | Không có `[MẪU]`; số liệu hiện "—", danh sách quy tắc trống |

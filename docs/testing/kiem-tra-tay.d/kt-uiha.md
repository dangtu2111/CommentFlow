## KT-UIHA — Tự động hóa + Quy tắc spam khớp HTML Stitch (UI-HTML-AUTOMATION, feat-ui-html-automation)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner mở `/app/automation` | Hai bảng Bình luận/Tin nhắn (kênh × Hỏi giá/Tư vấn/Mua hàng), ô chọn dạng viên đổi màu theo mức |
| 2 | Đổi vài ô, chỉnh ngưỡng/giờ/từ khóa, bấm Lưu | Banner "Đã lưu"; tải lại thấy đúng giá trị (logic không đổi) |
| 3 | Mở `/app/spam-rules`, điền quy tắc, Enter trong ô tên | Chỉ Xem trước, không lưu; bấm Lưu quy tắc mới lưu |
| 4 | Thu cửa sổ 390px cả hai trang | Không cuộn ngang cả trang; bảng ma trận cuộn ngang trong khung |

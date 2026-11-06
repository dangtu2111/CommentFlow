## KT-QRP — QR chuyển khoản + chờ xác nhận (QR-PAYMENT, feat-qr-payment) — chỉ làm được khi đã có tài khoản nhận tiền thật

> Cần: cờ `QR_PAYMENT_ENABLED=true` và ba biến `PAYMENT_*` trên máy thử (staging), một hóa đơn `pending` của workspace thử. Kiểm tự động đã phủ: `pnpm test` (vietqr, payment-qr, invoice-payment) và `pnpm test:db` (invoices.int.test.ts).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner mở Cài đặt → Gói & Thanh toán khi cờ TẮT | Khối thanh toán ghi "Sắp có", không có QR |
| 2 | Bật cờ, mở lại trang với hóa đơn đang chờ | Hiện QR, tên chủ tài khoản, số tài khoản, số tiền, nội dung chuyển khoản dạng `CF` + 8 ký tự |
| 3 | Quét QR bằng app ngân hàng | App điền sẵn đúng số tiền và nội dung; tên người nhận trùng chủ tài khoản |
| 4 | Bấm "Tôi đã chuyển khoản" | Hóa đơn hiện "Chờ xác nhận"; nút biến mất; bấm lại không tạo thêm gì |
| 5 | Staff mở cùng trang | Không thấy khối thanh toán; gọi trực tiếp bị từ chối |
| 6 | Xóa một biến `PAYMENT_*` rồi tải lại trang | Không có QR, báo chưa sẵn sàng (không lộ lỗi kỹ thuật) |

## KT-APC — Xác nhận thanh toán tự động (AUTO-PAYMENT-CONFIRM, feat-auto-payment-confirm) — chỉ làm được khi đã có tài khoản SePay/Casso và migration làn b

> Kiểm tự động đã phủ khóa sai, lệch tiền, gửi lại, mã mơ hồ: `pnpm test`. Các bước dưới cần tài khoản thật ở staging.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Cờ `BANK_WEBHOOK_ENABLED` tắt, gọi thử webhook | Trả 503, hóa đơn không đổi |
| 2 | Bật cờ ở staging; tạo hóa đơn thử, chuyển ĐÚNG số tiền kèm nội dung `CF…` | Hóa đơn thành "Đã thanh toán", lượt AI được cộng đúng một lần |
| 3 | Nhà cung cấp gửi lại cùng giao dịch | Không cộng lượt lần hai |
| 4 | Chuyển thiếu hoặc thừa 1 đồng | Hóa đơn vẫn "Chờ xác nhận", không cộng lượt; có dòng log "amount_mismatch" |
| 5 | Chuyển không kèm nội dung hoặc sai mã | Không hóa đơn nào đổi |

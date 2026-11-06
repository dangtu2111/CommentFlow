## KT-DOC — Khách chốt đơn trong bình luận: lưu khách trước, trả lời công khai không lặp SĐT/địa chỉ (DA-ORDER-IN-COMMENT, FR-156, feat-da-order-in-comment)

> Chưa nối pipeline/giao diện: chỉ lõi + test tự động; kiểm tay dồn cho `DA-ORDER-IN-COMMENT-WIRE`. / Core + automated tests only; manual checks deferred to `DA-ORDER-IN-COMMENT-WIRE`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/decide/order-comment-rules.test.ts` | Mọi test xanh |
| 2 | (Sau khi nối) Dùng Page thử, bình luận "Chốt áo M, sđt 09xx…, giao 12 đường…" | Khách xuất hiện ở Khách tiềm năng; câu trả lời công khai chỉ là "Shop đã nhận… sẽ inbox xác nhận", không có SĐT/địa chỉ; có gợi ý Ẩn cho nhân viên bấm |
| 3 | (Sau khi nối) Bình luận chỉ có "Chốt đơn nhé" hoặc chỉ có SĐT | Không bị coi là đơn hàng trong bình luận |

## KT-DHR — Chuyển người khi có ảnh/video chưa rõ sản phẩm (DA-HANDOFF-RULES, FR-143, feat-da-handoff-rules)

> Chưa nối pipeline/giao diện: chỉ lõi + test tự động; kiểm tay dồn cho `DA-HANDOFF-WIRE`. / Core + automated tests only; manual checks deferred to `DA-HANDOFF-WIRE`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/decide` | Mọi test xanh |
| 2 | (Sau khi nối) Khách bình luận ảnh + "mẫu này giá sao" trên bài chưa gắn sản phẩm | Bình luận vào "Cần người", lý do "Có ảnh, chưa nhận ra sản phẩm", không tự gửi |
| 3 | (Sau khi nối) Cùng bình luận trên bài đã gắn đúng 1 sản phẩm | AI trả lời bình thường |
| 4 | (Sau khi nối) Chỉ gửi sticker kèm chữ | Không bị coi là hỏi về ảnh |

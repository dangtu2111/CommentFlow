## KT-DH — Nhân viên đang giữ chuỗi thì AI không tự gửi (DA-HOLDER, FR-154, feat-da-holder)

> Chưa nối pipeline/giao diện: chỉ lõi + test tự động; kiểm tay dồn cho `DA-HOLDER-WIRE`. / Core + automated tests only; manual checks deferred to `DA-HOLDER-WIRE`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/decide/human-hold-rules.test.ts` | Mọi test xanh |
| 2 | (Sau khi nối) Nhân viên trả lời một bình luận, 10 phút sau khách hỏi tiếp, AI đang bật Tự động | AI chỉ gợi ý, không tự gửi; lý do "Nhân viên đang giữ chuỗi" |
| 3 | (Sau khi nối) Chờ quá thời gian giữ (mặc định 2 giờ) rồi khách hỏi tiếp | AI được tự gửi bình thường (nếu qua các cổng khác) |

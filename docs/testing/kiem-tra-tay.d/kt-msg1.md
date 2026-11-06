## KT-MSG1 — Tin chào / ngoài giờ / báo chuyển người (MSG-GREETINGS, feat-msg-greetings)

> Chỉ có phần logic (chưa giao diện, chưa gửi thật); mục đầy đủ trên Page thử làm khi nối `MSG-GREETINGS-WIRE`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/greetings` | Tất cả test đạt / All tests pass |
| 2 | Đọc tên test nhóm "luật Meta" | Có ca đúng 24 giờ gửi được, 24 giờ + 1 ms bị chặn; bình luận bị chặn / 24h edge and comment target covered |
| 3 | Đọc tên test nhóm "chọn mẫu theo ngôn ngữ" | vi, en, ngôn ngữ khác → dự phòng, thiếu mẫu → mặc định / vi, en, fallback, default covered |
| 4 | (Sau khi nối thật) Nhắn tin vào Page thử ngoài giờ làm việc, rồi nhắn thêm lần hai | Nhận đúng 1 tin ngoài giờ nêu giờ mở cửa; lần hai không có tin lặp / One out-of-hours reply with opening time, no repeat |

## KT-CAP — AI gợi ý caption/hashtag, emoji, chèn liên kết trong Biên tập (feat-composer-ai-caption)

> Làm bằng Owner, ở cả `vi` và `en`. Bước 4–8 cần LiteLLM, `CAPTION_LLM_MODEL` và cờ `cf.ai.caption` bật cho workspace (xem `docs/can-ban-cung-cap.d/composer-ai-caption.md`).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `/app/composer` khi cờ `cf.ai.caption` TẮT | Hai nút AI bị khóa, có dòng giải thích lý do |
| 2 | Bấm biểu tượng cảm xúc, chọn một emoji | Emoji chèn đúng chỗ con trỏ trong ô nội dung |
| 3 | Bấm liên kết, nhập `http://x.vn` rồi `https://shop.vn/a`, "Chèn liên kết" | http bị báo không hợp lệ; https được chèn vào nội dung |
| 4 | Gõ ý tưởng (không có số), bấm "AI gợi ý caption" | Hộp gợi ý hiện caption; "Dùng caption này" thay nội dung, "Thêm vào cuối" nối thêm |
| 5 | Bấm "Tự động hashtag" | Hiện tối đa 8 thẻ; "Thêm hashtag vào bài" thêm dòng cuối, không trùng thẻ đã có |
| 6 | Ý tưởng chứa giá "199.000đ" | Caption nếu giữ đúng giá thì hiện; nếu AI tự thêm giá/khuyến mãi khác thì báo bị từ chối |
| 7 | Gõ SĐT thật trong ý tưởng | Kiểm `ai_usage`/Langfuse: SĐT đã bị che trước khi gửi LLM |
| 8 | Ô nội dung trống | Hai nút AI bị khóa |

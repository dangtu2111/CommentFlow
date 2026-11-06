## KT-KSM — Câu mẫu của shop (KB-SAMPLES, FR-132, feat-kb-samples)

> Chưa có giao diện/DB: chỉ có lõi + test tự động; kiểm tay dồn cho `KB-SAMPLES-PERSIST`. / Core + automated tests only; manual UI checks deferred to `KB-SAMPLES-PERSIST`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/examples` | 22 test xanh |
| 2 | (Sau khi có bảng) Nhân viên gửi câu có SĐT khách + giá | Mẫu lưu `[sđt]` và `{price:…}`, không còn số thật |
| 3 | (Sau khi có bảng) Owner tắt một mẫu | Mẫu không xuất hiện trong ví dụ giọng văn khi soạn |

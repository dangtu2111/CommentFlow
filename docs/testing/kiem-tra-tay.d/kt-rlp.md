## KT-RLP — Giới hạn tốc độ gửi theo Page/bài/nội dung lặp (RATE-LIMIT-PAGE, FR-114)

Chỉ phần máy (chưa nối job `send`, chưa có Redis): người thử chạy test.
1. `pnpm --filter @flow/ai exec vitest run src/ratelimit src/recheck` → xanh. Kết quả mong đợi: không test đỏ (vượt 30/phút hoặc 600/giờ → hoãn; tự gửi vượt 60/giờ, 20/10 phút/bài hoặc 5 câu giống hệt/giờ → Chờ duyệt; mức dùng Meta App ≥90% chặn tự gửi nhưng không chặn người bấm).

---

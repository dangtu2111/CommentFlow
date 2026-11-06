## KT-ALP1 — Tự gửi theo ngôn ngữ (AUTOSEND-LANG-PARTIAL, feat-autosend-lang-partial)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/gate/lang-autosend.test.ts` | Mọi test xanh (30 ca, gồm property-based) |
| 2 | Khi đã nối pipeline: đặt ô Tự động chỉ cho tiếng Việt, gửi bình luận tiếng Anh | Không tự gửi (mức tắt) — hiện lý do "Mức kênh × nhãn" |
| 3 | Ngôn ngữ chưa đạt bộ đánh giá, ô Tự động | Chỉ ghi "sẽ gửi" (Chạy thử), không gửi thật |
| 4 | Bình luận bằng ngôn ngữ ngoài vi/en | Chuyển người, không tự gửi |
| 5 | Câu hỏi lại size ("Chị lấy size S, M hay L ạ?") ở ô Tự động, `allow_clarify` bật | Tự gửi; tắt `allow_clarify` → chờ duyệt |

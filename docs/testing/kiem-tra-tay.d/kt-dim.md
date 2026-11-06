## KT-DIM — Bình luận mạo danh chuyển người, không tự gửi/ẩn (DA-IMPERSONATION, FR-155, feat-da-impersonation)

> Chưa nối pipeline/giao diện: chỉ lõi + test tự động; kiểm tay dồn cho `DA-IMPERSONATION-WIRE`. / Core + automated tests only; manual checks deferred to `DA-IMPERSONATION-WIRE`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/decide/impersonation-rules.test.ts` | Mọi test xanh |
| 2 | (Sau khi nối) Tài khoản tên giống Page bình luận kèm link/"nhận quà" | Nhãn đỏ "Nghi mạo danh", báo ngay, AI không tự gửi; nút Ẩn chỉ hiện để người bấm |
| 3 | (Sau khi nối) Khách trùng tên Page hỏi giá bình thường | Không bị gắn nhãn mạo danh |

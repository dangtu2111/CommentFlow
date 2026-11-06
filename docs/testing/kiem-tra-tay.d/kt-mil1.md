## KT-MIL1 — Logic hộp thư tin nhắn (MSG-INBOX-LOGIC, feat-msg-inbox-logic)
Điều kiện: chưa có giao diện/nơi gọi trong pipeline; kiểm bằng lệnh trên máy code (chỉ đọc kết quả).
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/inbox` | Mọi test xanh (cửa sổ, quyền gửi AI/nhân viên, trạng thái, chuyển người, khóa) |
| 2 | Đọc tên test "quyền gửi khớp R8 của sendRecheck (property)" | Có và xanh: inbox cho gửi ⇔ `sendRecheck` R8 qua |
| 3 | Chạy `pnpm --filter @flow/ai test:coverage` | Không báo thiếu ngưỡng; `src/inbox` ≥ 95% nhánh |
| 4 | Khi có giao diện hộp thư (`MSG-INBOX-WIRE`) | Lặp lại kiểm tay: hội thoại >24 giờ khóa nút AI, hiện thẻ HUMAN_AGENT cho nhân viên; >7 ngày khóa ô soạn (vi + en) |

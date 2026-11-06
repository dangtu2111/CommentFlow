## KT-PMP — Che SĐT/email trước LLM/Langfuse (PII-MASK-PIPE, FR-033, feat-pii-mask-pipe)

> Hàm thuần, chưa nối pipeline/DB (cần `PIPE-ROUTE…` + `LEADS-KANBAN`) nên chưa bấm thử trên giao diện được. Hiện kiểm gián tiếp qua ô Thử AI.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Vào Thử AI, nhập "ib em 0912 345 678 hoặc a@b.co nhé" | Kết quả/nhật ký không hiện số hay email thật (chỉ `[sđt]`, `[email]`) |
| 2 | Nhập câu không có số/email ("Áo còn size M không?") | Câu giữ nguyên, không bị che |
| 3 | Khi `PIPE-ROUTE…` + `LEADS-KANBAN` xong: bình luận có SĐT → mở Khách tiềm năng | Có đúng số đã chuẩn hóa `0912345678`, câu gửi LLM đã che (chưa kiểm được) |

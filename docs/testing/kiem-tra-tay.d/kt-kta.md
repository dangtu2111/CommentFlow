## KT-KTA — Ô Thử AI hiện đoạn tìm được từ KB + điểm (KB-TRYAI, FR-059, feat-kb-tryai)

> Cần DB dev có phiên bản kiến thức đã xuất bản (KT-KPV) và đặt `TRY_AI_KB_REAL=true` (cờ TẮT mặc định).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Cờ TẮT, mở `/app/try-ai`, thử "ship về Hà Nội bao nhiêu" | Dòng "Nguồn: kiến thức mẫu"; nguồn mẫu "Phí vận chuyển" kèm điểm |
| 2 | Bật cờ, workspace chưa xuất bản phiên bản nào, thử lại | Vẫn "kiến thức mẫu" (không lỗi) |
| 3 | Bật cờ, workspace có phiên bản chứa đoạn về phí ship, thử "ship Cà Mau bao nhiêu" | Dòng "kiến thức đã xuất bản của shop"; đoạn thật hiện kèm điểm 0–1 giảm dần, đoạn dùng để soạn được đánh dấu |
| 4 | Câu hỏi không liên quan kiến thức nào | Không có nguồn; không tự gửi (thiếu nguồn) |
| 5 | Đổi giao diện sang English | Dòng nguồn + nhãn đổi sang tiếng Anh |

## KT-KG — Câu hỏi AI chưa trả lời được + bổ sung kiến thức nhanh (KB-GAPS-UI, FR-134, UF-11, feat-kb-gaps-ui)

> Cần có dòng trong `cf.kb_gaps` (pipeline chưa ghi — `RETRIEVAL-LOG-WIRE`); thử trên DB dev bằng một dòng chèn tay qua công cụ DB của chủ dự án.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập Owner → menu **Câu hỏi chưa trả lời** (`/app/kb-gaps`); đăng nhập Staff, gõ thẳng URL | Owner thấy trang; Staff nhận 404 và không có mục menu |
| 2 | Mở trang khi chưa có dòng | Dòng "Chưa có câu hỏi nào trong mục này" |
| 3 | Có gap `shipping` đếm 5 và `size` đếm 9 | Nhóm Size hiện trước Ship; mỗi dòng có số lần hỏi, ngày gần nhất, câu ví dụ đã che SĐT/email |
| 4 | Viết câu trả lời → **Bổ sung** | Dòng sang tab "Đã bổ sung"; có FAQ mới (hỏi + đáp) trong `cf.faq_items` |
| 5 | Để trống câu trả lời → **Bổ sung** | Báo "Cần nhập đủ câu hỏi và câu trả lời hợp lệ", không đổi trạng thái |
| 6 | **Bỏ qua** rồi tab "Đã bỏ qua" → **Mở lại** | Dòng chuyển qua lại đúng tab |
| 7 | Lọc theo chủ đề | Chỉ hiện chủ đề đó, giữ trạng thái đang xem |
| 8 | Đổi sang English | Mọi chữ đổi sang tiếng Anh |

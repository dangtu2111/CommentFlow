## 2k. `KB-GAPS-UI` (FR-134, UF-11) — không cần tài nguyên ngoài

Trang "Câu hỏi AI chưa trả lời được" chỉ đọc/ghi `kb_gaps` và `faq_items` trong DB; không gọi LLM, không biến môi trường mới, không cờ. Dữ liệu chỉ xuất hiện khi pipeline ghi `kb_gaps` (việc `RETRIEVAL-LOG-WIRE`); trước đó trang hiển thị "chưa có câu hỏi nào".

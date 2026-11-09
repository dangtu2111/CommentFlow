# ADR 017 — quyết định đã khóa (đổi phải có chủ dự án duyệt)

1. Sự kiện chưa biết → mời inbox. KHÔNG nhường văn xuôi tự trả lời, kể cả câu định tính.
2. Sự kiện định tính là ENUM, code viết câu theo ngôn ngữ khách. Không điền nguyên văn vào câu; nguyên văn chỉ lưu làm evidence.
3. Không thêm kind mới vào policy_facts; dữ liệu mới nằm trong data jsonb của 5 kind hiện có. Không migration cho ADR 017 trừ khi chủ dự án duyệt.
4. Chủ đề do extract trả enum (Zod), không regex.
5. Câu mời inbox chỉ do code viết.
6. Guard chữ số: chỉ số khách nêu đi qua customer_measure (qty, size); không whitelist mọi số trong câu khách.
7. Không sửa nhãn gold để khớp kết quả; không nới metric. Nhãn gold do chủ dự án cấp.
8. Chế độ tồn kho khai trong file shop (stockDisclosure); mặc định shop thật = chỉ còn/hết hàng.
9. Cờ cf.ai.fact_slots: chỉ bật [EVAL]; Shop Thử 2 bật khi sswiftly và demo-shop bật cờ ≥ không bật.
10. Đo: sửa nhỏ 1 lượt bộ liên quan; xong nhóm 1 lượt toàn bộ; mốc 3 lượt lấy lượt tệ nhất. ≤ 1 USD/lượt, ≤ 5 USD/chuỗi, dừng khi khóa ảo > 80%.

## Q-KB-UI-POL — Chính sách, Danh mục, Quy tắc: không dựng thêm trang trong đợt UI KB này

| Quyết định | Lý do | Cách đảo ngược |
|---|---|---|
| `kb-policies.html` (bản thường) không dựng riêng: `/app/kb/policies` đã dựng theo `kb-policies-structured` (đủ hơn: thẻ Ship/Đổi trả/Bảo hành/Thanh toán, trạng thái nháp/đã duyệt) | Hai thiết kế cùng một trang; bản có cấu trúc khớp ADR 017 và đã có dữ liệu thật | Chủ dự án chỉ định bản thường thì dựng lại theo `kb-policies.html` |
| `kb-catalog` (danh mục sản phẩm) và `kb-rules` (quy tắc trả lời & giới hạn) chưa dựng trang | Không có trang/dữ liệu nền: danh mục cần `/app/products` (chưa tồn tại, chỉ có nhập sản phẩm), quy tắc cần mô hình lưu quy tắc mới (migration) — vượt phạm vi "chỉ giao diện" và sẽ phải hiện số mẫu | Chủ dự án duyệt bước nền (danh sách sản phẩm; bảng quy tắc) rồi dựng từ HTML Stitch; mục rail "Quy tắc & Giới hạn" vẫn hiện "Sắp có" |

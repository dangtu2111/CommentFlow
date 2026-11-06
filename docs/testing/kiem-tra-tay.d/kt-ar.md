## KT-AR — Độ sẵn sàng của AI (AI-READINESS, FR-146, US-107)

Không cần khóa/dịch vụ ngoài; chỉ đọc dữ liệu workspace. Đăng nhập bằng tài khoản Owner (có workspace).
1. Mở menu Cài đặt → "Độ sẵn sàng AI" (en: "AI readiness"). Kết quả: trang `/app/readiness` hiện thanh %, 4 mục bắt buộc, 20 câu mẫu, gợi ý.
2. Workspace trống: thanh 0%, cả 4 mục "Còn thiếu" kèm gợi ý, trạng thái "Chưa đủ điều kiện bật chế độ Tự động".
3. Thêm 1 sản phẩm có giá, chính sách giao hàng (có thể chỉ ghi "ib shop"), chính sách đổi trả, số liên hệ hoặc giờ làm việc (theo ngôn ngữ đang dùng), tải lại. Kết quả: 4 mục "Đã có", điểm tăng; câu mẫu về giá/ship/đổi trả/liên hệ "Trả lời được".
4. Thêm size/màu/tồn kho, chính sách bảo hành + thanh toán, một FAQ khuyến mãi. Kết quả: điểm lên 100%, "Đủ điều kiện bật chế độ Tự động".
5. Đổi ngôn ngữ giao diện sang English: dữ liệu `vi` không tính, điểm tính lại theo mục `en`/"cả hai".
6. Đăng nhập Staff, mở `/app/readiness`. Kết quả: 404.
Lưu ý: điểm chỉ tính từ dữ liệu có sẵn, chưa đo bằng AI thật. Cần các trang nhập Sản phẩm/Kiến thức (`PRODUCTS-UI-API`, `KB-CONTENT-UI`, chưa có) hoặc thêm dữ liệu qua DB dev để thử bước 3–5.

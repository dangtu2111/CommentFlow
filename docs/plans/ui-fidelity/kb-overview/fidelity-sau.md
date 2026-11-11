# Báo cáo đủ thành phần — kb-overview (/app/kb)

Khớp 20/88 = 22.7%

Thiếu 68 mục:
- rag engine v
- bản nháp — thay đổi chưa xuất bản (v )
- tất cả kênh ( kênh)
- chạy kiểm thử (test cases)
- gợi ý: bổ sung chính sách đổi trả hàng sale • tối ưu tỷ lệ giải đáp tự động thêm +
- tối ưu ngay
- nguồn dữ liệu
- pdf
- tinh chỉnh hành vi
- kiểm thử & phiên bản
- có thay đổi từ nguồn website chờ duyệt
- url: annhienstore.vn/huong-dan-chon-size đã bổ sung bảng số đo váy suông hè .
- xem so sánh
- chấp nhận
- đã kết nối
- annhien-fashion.myshopify.com • đồng bộ lần cuối lúc hôm nay (thành công)
- đồng bộ ngay
- ngắt kết nối
- sản phẩm đã nạp vào vector db
- chính sách bán hàng đồng bộ
- trang blog & giới thiệu shop
- website & nguồn url web crawling
- tự động cập nhật thông tin trang tĩnh theo chu kỳ giờ/lần
- + thêm liên kết mới
- địa chỉ url
- phân loại
- trạng thái ai
- cập nhật
- thao tác
- https://annhienstore.vn/chinh-sach-doi-tra
- đổi trả hàng
- đã đọc ( )
- giờ trước
- quét lại
- xóa
- https://annhienstore.vn/phi-van-chuyen
- vận chuyển
- hôm qua
- https://annhienstore.vn/huong-dan-chon-size
- faq & size
- có thay đổi chờ duyệt
- phút trước
- so sánh
- xem trước sản phẩm trích xuất (bảng mini)
- dữ liệu thực thể được ánh xạ vào rag. trường khóa sẽ đồng bộ tự động từ shopify.
- váy hoa nhí vintage tay bồng
- sku: an-vh - • danh mục: váy thiết kế hè
- tồn kho:
- chiếc
- biến thể:
- s, m, l ( phân loại)
- vector embeddings: đã tạo
- ghi chú riêng cho ai (agent hint override)
- áp dụng tức thì cho kịch bản tư vấn
- sản phẩm chủ đạo mùa hè, tặng kèm scrunchies cùng màu cho mỗi đơn đặt trong tuần này. nếu khách hỏi chiều cao dưới m thì ưu tiên khuyên lấy size s để tôn dáng.
- widget chạy thử nghiệm ai (live playground)
- mô phỏng tức thì phản hồi của bot với cơ sở tri thức hiện tại
- llm: gemini pro (temperature: )
- nhập câu hỏi test giả lập khách hàng...
- trích xuất tri thức:
- nguồn: website > chính sách vận chuyển (annhienstore.vn/phi-van-chuyen)
- độ tin cậy:
- độ trễ: ms
- câu trả lời dự kiến của bot:
- trả lời đạt yêu cầu!
- “dạ chào bạn! shop
- miễn phí vận chuyển toàn quốc cho tất cả đơn hàng từ trở lên
- nha. đơn của bạn là đủ điều kiện nhận ưu đãi freeship rồi ạ! bạn có muốn shop tư vấn thêm chọn size hay chốt đơn luôn không ạ? 🥰”

## Hình học: kb-overview ↔ /app/kb (ngưỡng ≤ 2px)

Lệch 11/35 chỉ số.

| Mốc | Chỉ số | Stitch | Trang thật | Lệch |
|---|---|---|---|---|
| header | paddingRight | 0px | 24px | 24 |
| header | paddingLeft | 0px | 24px | 24 |
| header | color | rgb(16, 29, 37) | rgb(15, 28, 36) | — |
| thanh bên | height | 900px | 836px | -64 |
| thanh bên | paddingTop | 64px | 16px | -48 |
| thanh bên | paddingRight | 0px | 12px | 12 |
| thanh bên | paddingBottom | 0px | 16px | 16 |
| thanh bên | paddingLeft | 0px | 12px | 12 |
| thanh bên | color | rgb(16, 29, 37) | rgb(15, 28, 36) | — |
| card | (phần tử) | không thấy | có | — |
| nút chính | width | 137.765625px | 112.96875px | -24.8 |

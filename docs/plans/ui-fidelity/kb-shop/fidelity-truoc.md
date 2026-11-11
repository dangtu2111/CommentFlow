# Báo cáo đủ thành phần — kb-shop (/app/kb/shop)

Khớp 12/117 = 10.3%

Thiếu 105 mục:
- hệ thống & trí tuệ
- cơ sở kiến thức (knowledge base)
- bản nháp — thay đổi chưa xuất bản
- đã xuất bản v lúc
- áp dụng: tất cả kênh ( fb, ig, tiktok)
- so sánh thay đổi (diff)
- thử nghiệm ai lab
- xuất bản thay đổi
- độ đầy đủ dữ liệu thương hiệu
- hoàn thiện
- cơ sở kiến thức đã đủ thông tin cốt lõi để ai tự tin giải đáp các tình huống về shop & điểm bán mà không cần can thiệp tay.
- tabs kiến thức
- nguồn dữ liệu
- hỏi – đáp (faq)
- tài liệu (pdf/docx)
- giọng văn (tone)
- kiểm thử & phiên bản
- dữ liệu trong tab này là
- hồ sơ gốc (ground truth)
- . trí tuệ nhân tạo sẽ trích xuất để giải đáp các câu hỏi vị trí, pháp lý, giới thiệu và tài khoản ngân hàng của thương hiệu.
- độ ưu tiên: mức (cao nhất)
- tên hiển thị, định vị ngành hàng và thông tin nhận dạng thương hiệu
- ai prompt hub
- tên thương hiệu hiển thị
- tên chính thức ai sẽ xưng hô khi chat với khách hàng
- slogan / định vị thương hiệu
- thời trang nữ & phụ kiện d c
- + thêm nhãn ngành
- an-nhien-logo-master.png ( x px)
- thay logo
- xóa
- giới thiệu tóm tắt cho ai (ai core grounding context)
- / ký tự
- thời trang mẫu an nhiên là thương hiệu thời trang thiết kế nữ d c thành lập từ năm . shop chuyên các dòng đầm công sở, áo sơ mi lụa tơ tằm, chân váy a và blazer thanh lịch. điểm mạnh vượt trội (uvp): chất vải tuyển chọn loại (cotton , lụa hàn châu mềm mịn thoáng mát), may kỹ lớp, form dáng may đo chuẩn tỷ lệ phụ nữ việt từ kg đến kg (size s, m, l, xl). khách hàng có thể đổi size miễn phí trong ngày.
- cơ chế áp dụng của trợ lý ai:
- ai trích xuất tự động thông điệp này khi khách đặt câu hỏi như:
- "shop bán đồ gì thế?", "hàng tự may hay nhập quảng châu?", "chất vải có bị nhăn xù không?"
- . giúp phản hồi vừa chuẩn xác vừa đúng cá tính thương hiệu.
- địa chỉ cửa hàng & hệ thống showroom
- quản lý mạng lưới chi nhánh trực tiếp để điều phối khách ghé thử đồ
- mở đón khách trực tiếp
- trụ sở chính • tp.hcm
- chi nhánh — showroom quận
- chỉnh sửa
- xóa chi nhánh
- nguyễn trãi, phường bến thành, quận , tp. hồ chí minh
- có chỗ đỗ xe ô tô & xe máy miễn phí
- hotline chi nhánh:
- đồng bộ bản đồ google maps
- chi nhánh • hà nội
- chi nhánh — showroom cầu giấy
- cầu giấy, phường quan hoa, quận cầu giấy, hà nội
- cách ga tàu điện nhổn - cầu giấy m
- hành vi ai: tự động phát hiện tỉnh/thành của khách để gửi địa chỉ showroom gần nhất kèm link google maps.
- lịch mở cửa showroom và kịch bản ai trực ngoài giờ
- giờ mở cửa showroom đón khách
- t - cn
- đến
- giờ trực phản hồi online (cskh con người)
- ca & ca
- kích hoạt ai auto-pilot ca đêm ( - )
- auto
- ai vẫn tự động tư vấn sản phẩm, báo giá, lấy size và ghi nhận đơn hàng tạm. nếu gặp khiếu nại phức tạp, ai hẹn nhân viên liên hệ lại lúc h sáng mai.
- mẫu tin nhắn ai ngoài giờ:
- "dạ hiện tại đã ngoài giờ trực showroom (sau h), an nhiên xin phép ghi nhận thông tin size và đơn hàng của mình ngay tại đây nha. sáng mai chuyên viên sẽ gọi xác nhận và gửi hàng sớm nhất ạ!"
- kênh liên hệ & cổng bán hàng
- hotline, liên kết zalo oa, website và gian hàng sàn điện tử
- hotline tư vấn & khiếu nại khẩn cấp
- zalo official account (oa)
- website chính thức
- shopee mall
- chiến lược chốt đơn ai:
- chỉ chủ động gửi link website/sàn tmđt khi khách nói
- "gửi link shopee"
- hoặc
- "muốn đặt qua web"
- . mặc định ai ưu tiên tư vấn & chốt đơn trực tiếp tại khung chat để tối ưu chi phí sàn.
- thông tin pháp lý & tài khoản thanh toán chuyển khoản
- dữ liệu nguồn để ai cung cấp số tài khoản và tạo mã vietqr tự động khi khách chốt cọc
- vùng nhạy cảm • kiểm duyệt gắt gao
- tên công ty / hộ kinh doanh pháp lý
- mã số thuế doanh nghiệp (mst)
- sử dụng khi khách hàng yêu cầu xuất hóa đơn điện tử vat
- tự động sinh ảnh vietqr
- tích hợp sẵn webhook sepay. khi khách hàng đồng ý chốt đơn, ai tự động ghép số tiền kèm mã đơn hàng vào link ảnh qr gửi trực tiếp trong tin nhắn.
- tài khoản nhận thanh toán duy nhất được ai phê duyệt
- khớp nối sepay
- tên ngân hàng
- mb
- mbbank (ngân hàng quân đội)
- số tài khoản thụ hưởng
- chủ tài khoản (đúng theo cccd/đkkd)
- nguyen mai linh
- chi nhánh ngân hàng
- chi nhánh bến thành, tp.hcm
- cú pháp chuyển khoản chuẩn:
- + [sđt đặt hàng] (ví dụ: mai linh )
- rào cản an toàn tài chính (safety guardrail):
- ai nghiêm cấm gửi bất kỳ số tài khoản nào khác ngoài stk được cấu hình ở đây. mọi câu hỏi xin tài khoản phụ, tài khoản cá nhân nhân viên sẽ bị ai từ chối và cảnh báo an toàn tới quản lý shop.
- bản nháp cục bộ đang chờ lưu
- lần đồng bộ gần nhất: phút trước
- hủy thay đổi
- lưu bản nháp (draft)
- thử hỏi câu mẫu (ai lab)
- lưu & cập nhật tab thông tin

## Hình học: kb-shop ↔ /app/kb/shop (ngưỡng ≤ 2px)

Lệch 20/55 chỉ số.

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
| tiêu đề | width | 364.921875px | 856px | 491.08 |
| card | width | 1184px | 856px | -328 |
| card | height | 184px | 383px | 199 |
| card | paddingTop | 12px | 16px | 4 |
| card | paddingRight | 24px | 16px | -8 |
| card | paddingBottom | 12px | 16px | 4 |
| card | paddingLeft | 24px | 16px | -8 |
| card | marginBottom | 16px | 0px | -16 |
| card | color | rgb(16, 29, 37) | rgb(15, 28, 36) | — |
| nút chính | width | 169.375px | 55.46875px | -113.91 |
| nút chính | height | 40px | 34px | -6 |

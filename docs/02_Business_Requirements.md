# 02 — Yêu cầu nghiệp vụ (BRD)

> Phiên bản 0.4 · 02/11/2026 · Liên quan: `01_Project_Overview.md`, `03_Product_Requirements.md`

## 1. Bối cảnh kinh doanh

Shop online Việt Nam bán qua Facebook/Instagram/TikTok nhận lượng lớn bình luận dưới bài và quảng cáo. Phần lớn là câu hỏi lặp lại về giá, size, phí ship; một phần là khách chốt đơn, khiếu nại và spam. Thời gian trả lời quyết định tỷ lệ chốt. CommentFlow AI giảm thời gian trả lời và công nhân viên, đồng thời giữ quyền kiểm soát nội dung cho chủ shop.

## 2. Mục tiêu kinh doanh

| Mã | Mục tiêu | Chỉ số | Ngưỡng ban đầu |
|---|---|---|---|
| BO-1 | Doanh thu thuê bao định kỳ | Số workspace trả phí, MRR | ≥ 1 shop trả phí (theo dõi riêng; lộ trình phát triển dùng cổng kỹ thuật, xem `16`) |
| BO-2 | Lợi nhuận gộp dương mỗi khách | Biên gộp = (doanh thu − chi phí AI − hạ tầng chia đều) / doanh thu | ≥ 70% ở mức sử dụng tối đa của gói |
| BO-3 | Giảm thời gian phản hồi của shop | Thời gian phản hồi trung vị trước/sau | Đo trên pilot (chưa đặt mục tiêu) |
| BO-4 | Tin cậy | Số lần AI gửi sai giá/chính sách | 0 |
| BO-5 | Chuyển đổi dùng thử | % dùng thử → trả phí | Đo từ tháng 2 |

## 3. Phân khúc & giá trị

| Phân khúc | Nhu cầu chính | Giá trị CommentFlow |
|---|---|---|
| Shop nhỏ (1 kênh) | Trả lời "giá?" nhanh, không sót | Gợi ý trả lời từ kiến thức, inbox gom một chỗ |
| Shop vừa (2–3 kênh, nhiều nhân viên) | Chia việc, không trả lời trùng, tự động phần lặp | Khóa mềm, giao việc, AI tự trả lời có kiểm soát |
| Agency | Quản lý nhiều khách, báo cáo | Nhiều workspace, chuyển nhanh, báo cáo theo kênh |

## 4. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR-01 | Mỗi khách là một **workspace**; dữ liệu workspace tách biệt hoàn toàn |
| BR-02 | Hai vai trò trong workspace: **Owner**, **Staff** (quyền chi tiết ở `13_Security_Design.md`) |
| BR-03 | Một **lượt AI** = một bình luận hoặc một tin của khách được AI xử lý. "Thử AI" không trừ lượt (có giới hạn/ngày) |
| BR-04 | Hết lượt: bình luận/tin nhắn **vẫn vào đầy đủ**, AI ngừng xử lý, chuyển "Cần nhân viên" |
| BR-05 | Gói Starter **không** có AI tự trả lời; Growth/Business có |
| BR-06 | Cảnh báo ở 80% hạn mức; ở 100% chặn AI, đề xuất mua thêm/nâng gói |
| BR-07 | Dùng thử 14 ngày, 300 lượt; hết hạn → chỉ xem, giữ dữ liệu 30 ngày rồi xóa |
| BR-08 | Thanh toán bằng chuyển khoản QR với nội dung định danh workspace; Admin xác nhận tay; xác nhận → kích hoạt gói + tạo hóa đơn |
| BR-09 | AI chỉ tự gửi cho nhãn **Hỏi giá, Tư vấn, Mua hàng**; Khiếu nại/Spam/Khác không bao giờ tự gửi |
| BR-10 | AI không bao giờ tự ẩn; chỉ quy tắc **số điện thoại/link** do Owner bật mới tự ẩn, và luôn bỏ ẩn được |
| BR-11 | Bình luận có số điện thoại được lưu vào Khách tiềm năng trước khi ẩn |
| BR-12 | Giá, tồn kho lấy từ dữ liệu có cấu trúc (bảng sản phẩm/Shopify), không suy từ văn bản |
| BR-13 | Bài viết chưa gắn sản phẩm → AI không tự trả lời câu hỏi giá |
| BR-14 | Tin nhắn Facebook/Instagram: AI chỉ tự trả lời trong **24 giờ** sau tin cuối của khách; 24 giờ–7 ngày chỉ nhân viên; quá 7 ngày không nhắn |
| BR-15 | Trả lời riêng người bình luận (private reply): 1 tin, trong 7 ngày |
| BR-16 | Trả lời bằng ngôn ngữ khách dùng (Việt/Anh), trừ khi kênh cấu hình cố định |
| BR-17 | Không quy đổi tiền tệ; giữ đơn vị tiền của shop |
| BR-18 | Mọi thay đổi kiến thức có hiệu lực khi **Xuất bản**; đổi Sản phẩm/Chính sách → nhãn Tự động liên quan về Chạy thử |
| BR-19 | Đổi giá gói cước tạo phiên bản giá mới; workspace cũ giữ giá đến kỳ gia hạn |
| BR-20 | Yêu cầu xóa dữ liệu (Meta/Owner) được xử lý và tra cứu bằng mã xác nhận |

## 5. Gói cước (giả thuyết)

Xem bảng ở `01_Project_Overview.md` §7. Điều kiện mở bán: chi phí AI thực đo ≤ $2/1.000 lượt.

## 6. Yêu cầu tuân thủ

| Mã | Yêu cầu | Nguồn |
|---|---|---|
| CR-01 | Endpoint xử lý yêu cầu xóa dữ liệu + trang trạng thái | Meta Platform (Data Deletion Request Callback) |
| CR-02 | Chính sách quyền riêng tư, điều khoản, thỏa thuận xử lý dữ liệu (DPA) | Meta App Review; Luật 91/2025/QH15 |
| CR-03 | Đánh giá khả năng áp dụng Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (hiệu lực 01/01/2026) — CommentFlow xử lý dữ liệu thay shop nên có thể không được miễn | Cần luật sư xác nhận |
| CR-04 | Hóa đơn điện tử khi bán cho doanh nghiệp | Cần kế toán xác nhận |
| CR-05 | Chỉ dùng API chính thức; tuân thủ chính sách nhắn tin của Meta (cửa sổ 24 giờ, HUMAN_AGENT không tự động) | Meta Messenger Platform |

## 7. Giả định & phụ thuộc

- Meta App Review cho `pages_manage_engagement`, `pages_messaging`, quyền Instagram.
- TikTok API for Business (Organic/Accounts API) có đọc và trả lời bình luận trên video của tài khoản Business; cấp quyền cho tài khoản Việt Nam, API ẩn bình luận và tin nhắn: **chưa xác minh** (đăng ký từ GĐ0).
- Shopify app cần phân phối phù hợp (public app/xét duyệt) khi mở cho khách.
- Chi phí AI phụ thuộc model; ước tính dùng Claude Haiku 5.5 ($0,10/$0,50 mỗi triệu token, nguồn thứ cấp).

## 8. Tiêu chí thành công giai đoạn 1 năm đầu (đề xuất)

1. ≥ 1 shop trả phí sau pilot; tỷ lệ gia hạn được đo.
2. Biên gộp ≥ 70% trên mọi workspace trả phí.
3. 0 sự cố rò rỉ dữ liệu giữa workspace; 0 lần AI gửi sai giá.

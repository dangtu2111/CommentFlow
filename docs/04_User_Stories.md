# 04 — Người dùng và User Stories

> Phiên bản 0.5 · 02/11/2026 (thêm E10 cho FR-127–166; đồng bộ với bổ sung kiến trúc) · Ưu tiên: **P0** = MVP đủ tính năng (GĐ0–4, gồm bình luận Instagram) · **P1** = giai đoạn 5 (TikTok, tin nhắn) · **P2** = giai đoạn 5 trở đi

## 1. Persona

| Persona | Mô tả | Mục tiêu | Nỗi đau |
|---|---|---|---|
| **Chị Hoa — Owner shop thời trang** | 2 Fanpage + 1 Instagram, chạy quảng cáo hằng ngày, 3 nhân viên | Không sót đơn, trả lời đúng giá | Bình luận "giá?" hàng trăm lần, nhân viên báo sai giá khuyến mãi |
| **Minh — Staff trực bình luận** | Làm ca, chủ yếu dùng điện thoại và laptop | Xử lý nhanh, không trả lời trùng đồng nghiệp | Mở nhiều Page, không biết ai đã trả lời |
| **Anh Tuấn — Owner agency** | Quản lý 8 khách, mỗi khách 1–3 kênh | Chuyển khách nhanh, báo cáo cho khách | Mỗi khách một công cụ, khó chứng minh hiệu quả |
| **Founder — Admin nội bộ** | Vận hành CommentFlow | Thu tiền, kiểm soát chi phí AI, hệ thống ổn định | Không biết khách nào đang lỗ |

## 2. User stories

Định dạng: *Là [vai trò], tôi muốn [hành động] để [lợi ích].* Tiêu chí chấp nhận (AC) viết dạng Given/When/Then rút gọn.

### E1 — Onboarding & tài khoản

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-001 | Là Owner, tôi muốn đăng ký bằng email và tạo workspace để bắt đầu dùng thử | Đăng ký → workspace tạo, vai trò Owner, dùng thử 14 ngày/300 lượt | P0 |
| US-002 | Là Owner, tôi muốn kết nối Facebook Page bằng OAuth để nhận bình luận | Sau OAuth thấy danh sách Page; chọn ≤ giới hạn gói; trạng thái "Đang kết nối"; webhook được đăng ký | P0 |
| US-003 | Là Owner, tôi muốn nhập nhanh kiến thức (thông tin cửa hàng, sản phẩm Excel, chính sách) để AI soạn được ngay | Có thể "Để sau"; chưa có kiến thức → AI chỉ phân loại | P0 |
| US-004 | Là Owner, tôi muốn mời nhân viên qua email với vai trò Staff | Email mời; chấp nhận → thành viên; Staff không thấy trang cài đặt nhạy cảm | P0 |
| US-005 | Là Owner, tôi muốn bật xác thực 2 bước | Bắt buộc với Owner; có mã dự phòng | P0 |
| US-006 | Là Owner agency, tôi muốn chuyển nhanh giữa các workspace | Bộ chuyển workspace có tìm kiếm và số cần xử lý | P0 |

### E2 — Trang Bình luận

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-010 | Là Staff, tôi muốn thấy mọi bình luận cần xử lý ở một nơi | Bình luận mới hiện < 1 phút; lọc theo kênh, nhãn, trạng thái, nền tảng | P0 |
| US-011 | Là Staff, tôi muốn gửi gợi ý AI chỉ với 2 cú bấm | Mở bình luận → Gửi; `Ctrl/⌘+Enter`; tự chuyển bình luận kế tiếp | P0 |
| US-012 | Là Staff, tôi muốn biết AI dựa vào nguồn nào | Chip nguồn kiến thức mở được nội dung | P0 |
| US-013 | Là Staff, tôi không muốn trả lời trùng đồng nghiệp | Mở bình luận → khóa mềm "An đang xử lý" cho người khác | P0 |
| US-014 | Là Staff, tôi muốn sửa nhãn AI khi sai | Đổi nhãn được ghi lại để đo độ chính xác | P0 |
| US-015 | Là Staff, tôi muốn ẩn spam và bỏ ẩn khi nhầm | Ẩn cần xác nhận; Bỏ ẩn luôn có; ghi nhật ký | P0 |
| US-016 | Là Staff, tôi muốn biết vì sao gửi lỗi và thử lại | Lý do dễ hiểu; nút Thử lại; timeout → kiểm tra trước khi cho thử lại | P0 |
| US-017 | Là Staff, tôi muốn nhắn riêng cho người bình luận | Nút Nhắn riêng; vô hiệu khi đã nhắn hoặc quá 7 ngày | P1 |

### E3 — Tin nhắn

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-020 | Là Staff, tôi muốn thấy hội thoại sắp hết 24 giờ trước | Tab "Sắp hết 24 giờ" (< 2 giờ), sắp xếp lên đầu | P1 |
| US-021 | Là Staff, tôi muốn biết còn được nhắn bao lâu | Chỉ báo cửa sổ: còn X giờ / chỉ nhân viên (≤ 7 ngày) / hết hạn | P1 |
| US-022 | Là Staff, tôi muốn tắt AI cho một hội thoại | Công tắc theo hội thoại; tự tắt khi khách đòi gặp người, kèm lý do | P1 |
| US-023 | Là Staff, tôi muốn xem bình luận cũ và sản phẩm khách đã hỏi | Panel thông tin khách | P1 |

### E4 — Kiến thức & bài viết

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-030 | Là Owner, tôi muốn nhập sản phẩm từ Shopify | Chỉ đọc; giá/tồn kho cập nhật ngay khi Shopify đổi; tên/giá khóa sửa | P0 |
| US-031 | Là Owner, tôi muốn dán link trang chính sách | Xem trước văn bản trích; thay đổi định kỳ vào hàng chờ duyệt có so sánh | P0 |
| US-032 | Là Owner, tôi muốn gắn sản phẩm cho bài quảng cáo | Lọc bài chưa gắn; AI gợi ý, tôi xác nhận; gắn hàng loạt | P0 |
| US-033 | Là Owner, tôi muốn thêm ghi chú giá livestream có hạn | Ghi chú có ngày hiệu lực; hết hạn tự không dùng | P0 |
| US-034 | Là Owner, tôi muốn thử AI trước khi bật | Ô Thử AI hiện nhãn, câu trả lời, nguồn, "có được tự gửi không, vì sao" | P0 |
| US-035 | Là Owner, tôi muốn thay đổi kiến thức chỉ có hiệu lực khi tôi xuất bản | Bản nháp → Xuất bản → phiên bản; khôi phục được | P0 |
| US-036 | Là Owner, tôi muốn AI trả lời khách nói tiếng Anh bằng tiếng Anh | Nhận diện ngôn ngữ; giọng văn và mẫu tin theo ngôn ngữ | P0 |

### E5 — Tự động hóa

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-040 | Là Owner, tôi muốn chạy thử trước khi cho AI tự gửi | Mức Chạy thử ghi "sẽ gửi câu này", không gửi | P0 |
| US-041 | Là Owner, tôi muốn biết khi nào an toàn để bật Tự động | Bảng hiệu chuẩn; ngưỡng đề xuất kèm lý do; nút bật chỉ sáng khi đủ 50 mẫu và tỷ lệ sửa ≤ 10% | P0 |
| US-042 | Là Staff, tôi muốn hủy một câu AI sắp gửi | Khoảng trễ có nút Hủy và sửa | P0 |
| US-043 | Là Staff hoặc Owner, tôi muốn dừng mọi tự động ngay | Nút Dừng khẩn cấp luôn hiển thị | P0 |
| US-044 | Là Owner, tôi muốn AI tự tạm dừng khi bất thường | Gửi lỗi liên tiếp, vượt chi phí, tỷ lệ sai cao → tạm dừng + banner | P0 |
| US-045 | Là Owner, tôi không muốn AI gửi giá cũ nếu giá vừa đổi | Giá/tồn đổi sau khi soạn → câu tự gửi về "Chờ duyệt" lý do "Giá đã đổi"; nhân viên gửi → hộp xác nhận giá mới | P0 |
| US-046 | Là Owner, tôi muốn giá trong CommentFlow luôn khớp Shopify | Đối soát hằng đêm; "Đối soát lần cuối … — N lệch đã cập nhật"; nút Đối soát ngay | P0 |

### E6 — Khách tiềm năng & spam

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-050 | Là Owner, tôi muốn ẩn ngay bình luận có số điện thoại nhưng vẫn giữ số | Quy tắc Tự ẩn sau chạy thử; lưu Khách tiềm năng trước khi ẩn | P0 |
| US-051 | Là Staff, tôi muốn theo dõi khách tiềm năng đến khi chốt | Kanban Mới → Đã liên hệ → Đã chốt → Hủy; xuất Excel | P0 |

### E7 — Thanh toán & báo cáo

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-060 | Là Owner, tôi muốn biết đã dùng bao nhiêu lượt AI | Đồng hồ lượt; cảnh báo 80%; dự báo ngày hết | P0 |
| US-061 | Là Owner, tôi muốn thanh toán bằng chuyển khoản | QR + nội dung bắt buộc; trạng thái chờ xác nhận → đã nhận | P0 |
| US-062 | Là Owner, tôi muốn báo cáo hiệu quả hằng tuần | Email tóm tắt tuần; trang Báo cáo | P2 |

### E8 — Quyền riêng tư

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-070 | Là người dùng Facebook, tôi muốn yêu cầu xóa dữ liệu | Callback trả mã; trang tra cứu trạng thái | P0 |
| US-071 | Là Owner, tôi muốn xuất toàn bộ dữ liệu hoặc xóa workspace | Xuất qua link email; xóa nhiều bước xác nhận | P0 |

### E9 — Admin nội bộ

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-080 | Là Admin, tôi muốn xác nhận chuyển khoản nhanh | Dán nội dung sao kê → đúng workspace; lệch tiền cảnh báo; xác nhận → kích hoạt gói | P0 |
| US-081 | Là Admin, tôi muốn thấy workspace đang lỗ | Bảng lãi gộp; lọc < 50%; đặt trần chi phí AI | P0 |
| US-082 | Là Admin hỗ trợ, tôi muốn xem như khách để gỡ lỗi | Bắt buộc lý do, chỉ đọc, 30 phút, ghi nhật ký | P1 |
| US-083 | Là Admin, tôi muốn chạy lại webhook lỗi | Danh sách dead letter, Thử lại/Bỏ qua có lý do | P1 |
| US-084 | Là Admin, tôi muốn tạm khóa gửi của một kênh/workspace lạm dụng để bảo vệ Meta App | Tạm khóa có thời hạn + lý do; vẫn nhận bình luận; Owner được báo; ghi nhật ký | P0 |
| US-085 | Là Super Admin, tôi muốn bật/tắt tính năng theo workspace không cần deploy | Override theo workspace, % rollout, kill switch; có hiệu lực < 1 phút; ghi nhật ký | P0 |

### E10 — Độ chính xác và tình huống thực tế (bổ sung 02/11)

| ID | Story | AC | Ưu tiên |
|---|---|---|---|
| US-100 | Là khách, tôi gõ sai hoặc không dấu tên sản phẩm mà vẫn được trả lời đúng mẫu | "ao len xah" nhận đúng sản phẩm; dưới ngưỡng thì AI hỏi lại, không đoán (FR-127, FR-128) | P0 |
| US-101 | Là khách, tôi hỏi "còn size M màu đen không" và nhận câu trả lời đúng tồn kho | Tra `product_variants`; tồn kho nhập tay cũ > 3 ngày → "shop kiểm kho rồi báo" (FR-129, FR-151) | P0 |
| US-102 | Là khách, tôi hỏi "cao 1m6 nặng 55kg mặc size gì" | Tra bảng size; thiếu số đo → AI hỏi lại; giữa hai size → mời ib (FR-149) | P0 |
| US-103 | Là khách, tôi hỏi giá kèm phí ship | Có đơn giá từng mẫu; phí ship mời ib; không tự tính tổng; bình luận có tag Cần hỗ trợ thêm (FR-141) | P0 |
| US-104 | Là Owner, tôi muốn AI xưng hô đúng kiểu của shop | Chọn cách shop xưng và cách gọi khách theo từng ngôn ngữ; không đoán giới tính (FR-142) | P0 |
| US-105 | Là Owner, tôi muốn AI không trả lời giống hệt nhau dưới cùng một quảng cáo | 3–5 cách diễn đạt cùng nội dung; không trùng chữ trên cùng bài trong 1 giờ (FR-161) | P0 |
| US-106 | Là Owner, tôi muốn biết khách hỏi gì mà AI chưa trả lời được | Mục "Câu hỏi AI chưa trả lời được" gom theo chủ đề và sản phẩm, có nút bổ sung kiến thức (FR-134, FR-141) | P0 |
| US-107 | Là Owner, tôi muốn biết khi nào AI đủ sẵn sàng | Thanh Độ sẵn sàng theo checklist + câu hỏi mẫu; < 80% không bật được Tự động (FR-146) | P0 |
| US-108 | Là Owner, tôi muốn được cảnh báo khi giá trong quảng cáo khác giá kho | Cảnh báo kèm hai con số; bình luận liên quan chuyển người (FR-150) | P0 |
| US-109 | Là khách, tôi gõ liên tiếp 3 bình luận ngắn và nhận một câu trả lời gộp | Gộp trong 30 giây, trả lời vào bình luận cuối (FR-148) | P0 |
| US-110 | Là Staff, tôi muốn AI không chen vào chuỗi tôi đang trả lời | Nhân viên trả lời trong 2 giờ → AI chỉ gợi ý (FR-154) | P0 |
| US-111 | Là Owner, tôi muốn được báo khi có tài khoản mạo danh shop | Nhãn "Nghi mạo danh", báo ngay, gợi ý Ẩn (FR-155) | P0 |
| US-112 | Là khách, tôi để lại thông tin đặt hàng trong bình luận mà thông tin không bị lặp lại công khai | Lead có sản phẩm/biến thể/số lượng/SĐT/địa chỉ; câu trả lời công khai không chứa SĐT/địa chỉ (FR-156) | P0 |
| US-113 | Là Owner, tôi muốn lên lịch và đăng bài tự động trên các kênh | Soạn bài có AI gợi ý caption, lên lịch, bài tự gắn sản phẩm (FR-166) | P2 (sau GĐ5) |

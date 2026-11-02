# 03 — Đặc tả sản phẩm (PRD)

> Phiên bản 0.7 · 02/11/2026 (bổ sung pipeline và kiến thức FR-127–166; làm mới từ đầu; giai đoạn theo 16 v0.3) · Liên quan: `02_Business_Requirements.md`, `05_Functional_Requirements.md`, `08_UI_UX_Specification.md`

## 1. Tầm nhìn sản phẩm

"Trả lời khách nhanh hơn, vẫn đúng giọng của shop." Một nơi duy nhất để xử lý bình luận và tin nhắn đa nền tảng, nơi AI làm phần lặp lại và con người giữ quyền quyết định.

## 2. Mô-đun sản phẩm

| Mã | Mô-đun | Mô tả ngắn | Giai đoạn |
|---|---|---|---|
| M01 | Workspace & tài khoản | Đăng ký, workspace, Owner/Staff, mời thành viên, 2FA | 0 |
| M02 | Kênh | Kết nối Facebook Page, Instagram chuyên nghiệp, TikTok Business; trạng thái kết nối | 1 (Facebook), 4 (bình luận Instagram), 5 (TikTok, tin nhắn) |
| M03 | Trang Bình luận | Inbox 3 cột, duyệt/sửa/gửi/ẩn/nhắn riêng, khóa mềm, phím tắt | 1 (tay), 2 (gợi ý AI) |
| M04 | Trang Tin nhắn | Hội thoại, cửa sổ 24 giờ/7 ngày, AI theo hội thoại, panel khách | 5 |
| M05 | Pipeline AI | Lọc → chuẩn hóa/nhận ngôn ngữ → cache → phân loại → tìm kiến thức → soạn → kiểm tra → quyết định tự gửi | 2 (gợi ý), 4 (tự gửi) |
| M06 | Cơ sở kiến thức | 8 phần, nhập Excel/Shopify/link, phiên bản, kiểm thử, từ điển viết tắt, song ngữ | 2 (tay/Excel), 4 (Shopify/URL), 5 (vector) |
| M07 | Bài viết | Danh sách bài theo nền tảng/kênh, gắn sản phẩm, ghi chú theo bài | 2 |
| M08 | Tự động hóa | 5 tab: Tổng quan, Bình luận, Tin nhắn, Cài đặt chung, Chạy thử & xem lại; dừng khẩn cấp | 4 |
| M09 | Quy tắc spam | Chỉ đánh dấu; Tự ẩn cho số điện thoại/link | 4 |
| M10 | Khách tiềm năng | Trích số điện thoại/địa chỉ/sản phẩm, Kanban trạng thái, xuất Excel | 4 |
| M11 | Báo cáo | Chỉ số phản hồi, % AI xử lý, nhãn, nhân viên, email tuần | 5 |
| M12 | Gói & thanh toán | Gói, lượt AI, mua thêm, QR, hóa đơn, dùng thử | 2 (hạn mức), 3 (thanh toán) |
| M13 | Thông báo | Đẩy (PWA) + email theo sự kiện, giờ yên lặng | 5 |
| M14 | Nhật ký | Chỉ đọc, lọc, chi tiết trước/sau | 1 |
| M15 | Dữ liệu & quyền riêng tư | Thời gian lưu, xuất dữ liệu, xóa workspace, yêu cầu xóa | 3 |
| M16 | Admin Console | Workspaces, thanh toán, chi phí AI, sức khỏe tích hợp, hàng đợi, gói, quyền riêng tư, nội dung hệ thống, feature flags, quản trị viên | 3 (tối thiểu), 5 |

## 3. Đặc tả chính theo mô-đun

### M03 — Trang Bình luận
- Tab trạng thái: Sẽ tự gửi · AI đã tự gửi · Chờ duyệt · Cần nhân viên · Nghi spam · Gửi lỗi · Đã trả lời · Đã ẩn · Bỏ qua · Tất cả.
- Sắp xếp cũ nhất trước; nhãn Mua hàng/Khiếu nại lên đầu.
- Chi tiết: ngữ cảnh bài + sản phẩm gắn bài, bình luận, lịch sử người này, nhãn + độ tin cậy, ô soạn có gợi ý + chip nguồn kiến thức, hành động Gửi / Ẩn / Bỏ qua / Nhắn riêng / Giao cho.
- Tối đa 2 cú bấm để gửi gợi ý đúng; phím tắt `Ctrl/⌘+Enter`, `H`, `E`, `M`, `J/K`.

### M04 — Trang Tin nhắn
- Danh sách hội thoại sắp hết 24 giờ lên đầu; đồng hồ cửa sổ nhắn tin.
- Bong bóng khách / nhân viên / AI tự động phân biệt rõ; thẻ trích bình luận gốc.
- Công tắc AI theo hội thoại; tự tắt khi khách đòi gặp người hoặc khiếu nại; tối đa N lượt AI/hội thoại; khách hỏi lại ≥ 3 lần → chuyển người.

### M05 — Pipeline AI
- Nhãn: Hỏi giá · Tư vấn · Mua hàng · Khiếu nại · Spam · Khác.
- Thứ tự kiểm tra trước khi tự gửi (code, không phải AI): công tắc workspace → mức kênh × nhãn → ghi đè bài viết → nhãn bị chặn → ngưỡng độ tin cậy → code tính lại "cần duyệt" (số tiền không có trong nguồn, khách rất bực, dấu hiệu chèn lệnh, hỏi lại ≥ 3 lần) → từ khóa chặn → giới hạn câu/ngày → trần chi phí AI workspace → giờ hoạt động → cửa sổ nhắn tin.
- Kết quả AI không đọc được → độ tin cậy 0, chuyển người.
- **Bổ sung 02/11 (FR-136–165):**
  - Một bước `extract` tách nhãn (nhiều nhãn) và thông tin (sản phẩm, size, màu, chiều cao/cân nặng, số lượng, giá khách nhắc, ý đặt hàng); tối đa 2 lần gọi LLM mỗi lượt.
  - Viết lại câu hỏi theo ngữ cảnh (chuỗi bình luận, caption, sản phẩm gắn bài); định tuyến: câu giá/size/còn hàng đã nhận sản phẩm → tra SQL.
  - **Thang xử lý khi không chắc** (code chọn): Trả lời → Hỏi lại khách → Chuyển hướng (ib shop, tag Cần hỗ trợ thêm) → Chuyển người. AI không tự tính tổng tiền, giảm giá, phí ship.
  - Mỗi ý có sự kiện phải có nguồn; xưng hô theo cấu hình shop; 3–5 cách diễn đạt cùng nội dung, không lặp chữ trong 1 giờ trên cùng bài.
  - Độ tin cậy do code tính từ tín hiệu đo được, hiệu chuẩn theo hành vi nhân viên; gộp bình luận liên tiếp < 30 giây.

### M06 — Cơ sở kiến thức
- 8 phần: Thông tin cửa hàng · Sản phẩm · Chính sách · FAQ · Tài liệu · Giọng văn · Quy tắc trả lời & giới hạn · Kiểm thử & phiên bản; cộng Nguồn dữ liệu (Shopify, link website) và Từ điển viết tắt.
- Nguồn sản phẩm: nhập tay, Excel, **Google Sheets đồng bộ** (GĐ2), Shopify (GĐ4), Haravan → Sapo → KiotViet → Pancake POS (GĐ5) — FR-121, FR-122.
- Bản nháp → Xuất bản tạo phiên bản; bộ câu kiểm thử chạy trước khi xuất bản.
- Giá/tồn từ Shopify cập nhật thẳng (không qua bản nháp) và đối soát hằng đêm; Shopify là nguồn đúng.
- Song ngữ: mục kiến thức có trường ngôn ngữ; giọng văn và mẫu tin theo ngôn ngữ.
- **Bổ sung 02/11 (FR-127–135, 146, 149, 151, 164):** biến thể sản phẩm là bảng riêng (size, màu, giá, tồn); tìm sản phẩm chịu gõ sai/không dấu + bí danh; bảng size có cấu trúc; đoạn kiến thức có ngữ cảnh và hạn hiệu lực; câu mẫu của shop; mục "Câu hỏi AI chưa trả lời được" (`kb_gaps`); thanh Độ sẵn sàng của AI (< 80% không bật Tự động); tồn kho nhập tay cũ > 3 ngày không nêu số lượng; nội dung nhập có dấu hiệu cài lệnh phải duyệt.

### M08 — Tự động hóa
- 3 mức mỗi kênh × nhãn: Tắt / Chạy thử / Tự động.
- **Song ngữ:** mức Tắt/Chạy thử/Tự động, mẫu hiệu chuẩn và ngưỡng tính **riêng cho từng ngôn ngữ** (vi, en); một ngôn ngữ chưa đạt bộ đánh giá thì chỉ gợi ý, không cho bật Tự động ngôn ngữ đó.
- Hiệu chuẩn ngưỡng: ≥ 50 mẫu (mỗi ngôn ngữ); nâng khi khoảng trên ngưỡng có > 10% bị sửa (≥ 10 mẫu); hạ khi khoảng dưới có 15 mẫu, 0% sửa; sàn 0,80; mặc định 0,85.
- Cài đặt chung: ngưỡng, khoảng trễ 0–5 phút, giới hạn câu/ngày, giờ hoạt động, từ khóa chặn, chữ ký công bố tự động, hạn mức chi phí, điều kiện tự tạm dừng.
- Thứ tự áp dụng: ghi đè bài viết → kênh → mặc định workspace.

## 4. Chỉ số sản phẩm

| Chỉ số | Định nghĩa |
|---|---|
| Thời gian phản hồi trung vị | Từ lúc bình luận/tin nhắn tạo đến lúc Page trả lời |
| % trả lời trong 15 phút | — |
| % AI tự xử lý | Số câu AI tự gửi / tổng câu đã trả lời |
| Tỷ lệ gửi nguyên văn | Gợi ý AI được gửi không sửa / tổng gợi ý đã duyệt |
| Tỷ lệ đổi nhãn | Nhãn bị nhân viên đổi / tổng đã duyệt |
| Tỷ lệ đánh dấu sai | Câu AI tự gửi bị đánh dấu sai / tổng câu AI tự gửi |
| Chi phí AI / 1.000 lượt | Từ `ai_usage` + Langfuse |
| Thời gian đến giá trị đầu tiên | Đăng ký → gợi ý đầu tiên (< 30 phút) |

## 5. Phát hành theo giai đoạn

Xem `16_Development_Roadmap.md` v0.4 (làm mới từ đầu; danh sách FR theo giai đoạn ở §3.2). **Bản chạy thật (GĐ3)** = M01, M02 (Facebook), M03, M05 (gợi ý), M06 (tay/Excel), M07, M12, M14, M15 + Admin tối thiểu. **MVP đủ tính năng (GĐ4)** thêm M08 (bình luận), M09, M10, M06 (Shopify), M02 (bình luận Instagram). **GĐ5** thêm M02 (TikTok), M04, M11, M13.

## 6. Câu hỏi mở

| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| Q1 | ~~Giao diện có cần bản tiếng Anh ngay không?~~ **Đã chốt 02/11: cần cả giao diện Việt + Anh từ GĐ0, và AI tự trả lời tốt cả hai ngôn ngữ** | Phạm vi i18n (FR-119, FR-120) |
| Q2 | Model soạn trả lời cuối cùng (sau đánh giá tiếng Việt) | Chi phí/1.000 lượt |
| Q3 | ~~Số ngày lấy bình luận cũ~~ **Chốt: Owner chọn 3/7/30 ngày (FR-011)** | Onboarding, chi phí |
| Q4 | ~~Thời gian lưu~~ **Chốt: 12 tháng (FR-126)** | Pháp lý |
| Q5 | TikTok API for Business cấp quyền bình luận cho tài khoản Việt Nam không; có API ẩn không | Connector TikTok (GĐ5) |

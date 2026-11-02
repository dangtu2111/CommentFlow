# 01 — Tổng quan dự án CommentFlow AI

| | |
|---|---|
| Phiên bản | 0.7 (chốt, 02/11/2026 — thêm quyết định về độ chính xác và hướng mở rộng) |
| Ngày | 01/11/2026 |
| Chủ sở hữu | Founder (Owner sản phẩm) |
| Nguồn | [Quy trình nghiệp vụ & workflow](https://claude.ai/artifact/L3eU24A9Chw6rHbwAjN8dP) · [Kế hoạch xây dựng phần mềm](https://claude.ai/artifact/VmTiuNDi1MeKpvscZFJRw9) · [Kế hoạch tháng](https://claude.ai/artifact/B5bXPZYPwAsU32Ke9ZZg5J) · `CommentFlow_UI_Design_Prompt.md` · `CommentFlow_Admin_Design_Prompt.md` |
| Trạng thái | Tổng hợp từ thiết kế đã thống nhất; dự án **làm mới từ đầu** (02/11/2026); lộ trình `16_Development_Roadmap.md` v0.3 |

## 1. Tóm tắt

CommentFlow AI là SaaS giúp **shop online và agency tại Việt Nam** trả lời **bình luận và tin nhắn** trên **Facebook, Instagram, TikTok** nhanh hơn. AI phân loại, soạn câu trả lời từ **cơ sở kiến thức của shop**, và **tự gửi khi Owner cho phép**; còn lại nhân viên duyệt rồi gửi. Hỗ trợ **tiếng Việt và tiếng Anh** (gồm tiếng Việt không dấu, teencode, câu trộn).

**Vòng lặp cốt lõi:** bình luận/tin nhắn mới → lưu → AI phân loại → tìm kiến thức (ưu tiên sản phẩm gắn với bài) → soạn trả lời → tự gửi (nếu đủ điều kiện) hoặc nhân viên duyệt → gửi/ẩn qua API chính thức → ghi nhật ký.

## 2. Vấn đề

- Shop chạy quảng cáo nhận rất nhiều bình luận lặp lại ("giá?", "ib", "size?"); trả lời chậm → mất đơn.
- Nhân viên phải mở nhiều Page/tài khoản, dễ sót bình luận, trả lời sai giá.
- Bình luận spam và bình luận chứa số điện thoại bị đối thủ khai thác.
- Công cụ hiện có hoặc tự động hoàn toàn (rủi ro sai giá) hoặc thủ công hoàn toàn (chậm).

## 3. Mục tiêu

| Mục tiêu | Thước đo | Mốc (theo giai đoạn, không đặt hạn ngày) |
|---|---|---|
| Bản chạy thật | Bình luận Facebook + kiến thức + AI gợi ý (nhân viên duyệt) chạy trên staging với Page thật | Giai đoạn 3 |
| MVP đủ tính năng | + AI tự gửi an toàn, bình luận Instagram, Shopify, App Review đã nộp | Giai đoạn 4 |
| Kinh tế đơn vị dương | Chi phí AI ≤ $2 / 1.000 lượt; biên gộp mỗi gói ≥ 70% | Giai đoạn 2 |
| An toàn trả lời | 0 lần gửi sai giá; mọi số tiền trong câu AI kiểm bằng code | Liên tục |
| Doanh thu đầu tiên | ≥ 1 shop trả phí | Theo dõi riêng (mục tiêu kinh doanh, không phải cổng phát triển) |
| Tốc độ onboarding | Từ đăng ký đến gợi ý đầu tiên < 30 phút | Giai đoạn 3 |

## 4. Phạm vi

### 4.1 Trong phạm vi (theo giai đoạn)

| Nhóm | Nội dung | Giai đoạn |
|---|---|---|
| Kênh | Bình luận Facebook | 1 |
| Kênh | Bình luận Instagram (cùng Meta App) | 4 |
| Kênh | Bình luận TikTok (khi được cấp quyền TikTok API for Business; có thể sớm hơn) | 5 |
| Kênh | Tin nhắn Messenger, Instagram | 5 |
| Kênh | Tin nhắn TikTok (Business Messaging API, cần xác minh) | 5+ |
| AI | Phân loại 6 nhãn, soạn gợi ý trả lời (nhân viên duyệt) | 2 |
| AI | Tự động 3 mức (Tắt / Chạy thử / Tự động), hiệu chuẩn ngưỡng, kiểm tra lại trước khi gửi | 4 |
| Kiến thức | Nhập tay + Excel, phiên bản, ô Thử AI | 2 |
| Kiến thức | Nhập Shopify + đối soát, link website | 4 |
| Kiến thức | Lập chỉ mục vector song ngữ (dịch vụ `ml`, pgvector) | 5 |
| Bài viết | Gắn sản phẩm cho bài, ghi chú theo bài | 2 |
| Vận hành | Trang Bình luận, Nhật ký | 1 |
| Vận hành | Quy tắc spam (gồm tự ẩn số điện thoại/link), Khách tiềm năng | 4 |
| Vận hành | Trang Tin nhắn | 5 |
| Nền tảng | saas-core (đăng ký, workspace, thành viên, RLS), feature flag, `ai_usage` | 0 |
| Thương mại | Gói cước theo lượt AI, dùng thử, chuyển khoản QR, hóa đơn, hạn mức | 2 (hạn mức), 3 (thanh toán) |
| Quản trị | Admin Console nội bộ | 3 (tối thiểu), 5 |
| Pháp lý | Xóa dữ liệu theo yêu cầu Meta, chính sách quyền riêng tư, thỏa thuận xử lý dữ liệu | 3 |
| Báo cáo | Báo cáo hiệu quả, email tóm tắt tuần | 5 |
| Ngôn ngữ | **Giao diện song ngữ Việt + Anh từ đầu** (0); **AI trả lời và tự động trả lời tốt cả tiếng Việt lẫn tiếng Anh** (2, 4) — chốt 02/11 | 0, 2, 4 |

### 4.2 Ngoài phạm vi

Cổng thanh toán thẻ/ví online · AI tự ẩn bình luận (chỉ quy tắc số điện thoại/link do Owner bật mới tự ẩn) · xóa bình luận · gửi tin nhắn quảng cáo hàng loạt · ứng dụng mobile riêng · ngôn ngữ ngoài Việt/Anh · ProfitPilot · ExcelFlow (sản phẩm riêng, làm sau).

## 5. Người dùng

| Nhóm | Mô tả |
|---|---|
| Shop online | 1–3 kênh, 1–5 nhân viên trực bình luận; ngành thời trang, mỹ phẩm, gia dụng |
| Agency | Quản lý nhiều khách; mỗi khách một workspace; một người thuộc nhiều workspace |
| Owner | Chủ workspace: kết nối kênh, kiến thức, tự động hóa, thanh toán |
| Staff | Nhân viên: xử lý bình luận/tin nhắn, khách tiềm năng |
| Admin nội bộ | Đội vận hành CommentFlow: Super Admin, Hỗ trợ, Kế toán |

## 6. Nguyên tắc bất biến

1. AI chỉ tự gửi khi Owner đã bật cho đúng kênh × nhãn và câu trả lời dựa hoàn toàn vào kiến thức; **AI không bao giờ tự ẩn**.
2. Chỉ dùng API chính thức của Meta, TikTok, Shopify.
3. Giá, tồn kho đọc trực tiếp từ dữ liệu có cấu trúc; mọi số trong câu AI phải có trong nguồn (kiểm bằng code).
4. Mỗi workspace chỉ thấy dữ liệu của mình (RLS ở database); khóa cache luôn có `workspace_id`.
5. Mọi hành động thay đổi dữ liệu hoặc gọi lên nền tảng đều ghi nhật ký.
6. Bỏ qua bình luận/tin nhắn do chính Page viết (chống vòng lặp tự trả lời).

## 7. Mô hình kinh doanh (giả thuyết)

| Gói | Giá/tháng | Kênh | Lượt AI/tháng | AI tự trả lời |
|---|---|---|---|---|
| Starter | 299.000đ | 1 | 1.000 | Không (chỉ gợi ý + chạy thử) |
| Growth | 699.000đ | 3 | 3.000 | Có |
| Business | 1.490.000đ | 10 | 7.500 | Có |
| Gói thêm | 149.000đ | — | +1.000 | — |

Dùng thử 14 ngày gói Growth, tối đa 300 lượt. Bảng giá chỉ mở bán khi chi phí AI ≤ $2/1.000 lượt (hiện tại đo được ~$25/1.000 lượt; ước tính kiến trúc mới ~$0,25/1.000 lượt — xem `16_Development_Roadmap.md`).

## 8. Bên liên quan

| Vai trò | Trách nhiệm |
|---|---|
| Founder | Sản phẩm, phát triển (2–4 giờ/ngày), bán hàng |
| Khách thử (pilot) | 1–3 shop, phản hồi và dữ liệu đánh giá (từ tháng 2) |
| Luật sư (thuê ngoài) | Luật 91/2025/QH15, thỏa thuận xử lý dữ liệu |
| Kế toán | Thuế GTGT, hóa đơn điện tử |

## 9. Ràng buộc & giả định

- Thời gian phát triển 2–4 giờ/ngày, **không giới hạn tổng thời gian** (chốt 02/11: xong khi qua cổng kiểm tra); ngân sách thử nghiệm 20 triệu VNĐ (tháng 1 chi tối đa 7 triệu).
- **Chưa có source code** — dựng khung mới theo `09`; repo Customer-Support-AI-Employee (MIT) chỉ làm tài liệu tham khảo. Công cụ: Claude Code (+ Codex khi thiếu token), chỉ chép rule ECC.
- Meta App Review và Business Verification có thể kéo dài; pilot chạy với người dùng có vai trò trong app.
- Tỷ giá giả định 27.000đ/USD cho mọi ước tính chi phí.

## 9a. Quyết định đã chốt (02/11/2026)

| Chủ đề | Quyết định |
|---|---|
| Hướng phát triển | Làm mới bằng TypeScript; repo Customer-Support-AI-Employee chỉ tham khảo |
| Thời gian | Không giới hạn; chuyển giai đoạn khi qua cổng kiểm tra |
| Kiến trúc | Đủ 7 dịch vụ từ GĐ0; Langfuse tự host cùng VPS |
| Máy chủ | Tại Việt Nam; quy mô năm đầu < 50 shop; 1 VPS 8 vCPU / 32 GB |
| Nền tảng mạng xã hội | Facebook (bài thường + quảng cáo dark post) → Instagram → TikTok |
| Nguồn sản phẩm | Nhập tay, Excel, Google Sheets đồng bộ → Shopify → Haravan → Sapo → KiotViet → Pancake POS |
| Ngôn ngữ | Giao diện app khách Việt + Anh từ đầu; Admin tiếng Việt trước; AI tốt cả hai ngôn ngữ |
| Model AI | Chọn theo bộ đánh giá (Anthropic / OpenAI / Google) qua LiteLLM |
| Lấy bình luận cũ | Owner chọn 3 / 7 / 30 ngày |
| Lưu dữ liệu | 12 tháng |
| Thanh toán | Xác nhận tay trước, tự động (SePay/Casso) sau |
| saas-core | Tách ngay từ đầu cho ExcelFlow |
| Tên sản phẩm, tên miền | Chưa chốt — cấu hình được (FR-125) |
| Công cụ lập trình | Claude Code gói Pro (Sonnet mặc định, opusplan khi cần) + Codex (ChatGPT Plus/Pro) |
| Meta App | Đang ở chế độ dev — cần Business Verification + App Review |
| Thiết kế | Stitch đủ app khách; Admin dựng theo prompt Admin + design tokens |
| Độ chính xác trả lời | Giá/size/tồn tra bằng SQL; mỗi ý phải có nguồn; thang Trả lời → Hỏi lại → Chuyển hướng → Chuyển người; AI không tự tính tổng tiền/phí ship; độ tin cậy do code tính (FR-127–165) |
| Hướng mở rộng | Lên lịch và đăng bài tự động sau GĐ5 (FR-166) |

## 10. Rủi ro chính

| Rủi ro | Biện pháp |
|---|---|
| Chi phí AI cao làm lỗ | Pipeline tiết kiệm từ đầu; cổng ≤ $2/1.000 lượt ở Giai đoạn 2 trước khi mở bán; hạn mức theo gói và workspace |
| App Review bị từ chối/chậm | Pilot bằng tài khoản tester; chế độ duyệt tay vẫn chạy |
| AI trả lời sai giá | Kiểm số bằng code, ngưỡng hiệu chuẩn, khoảng trễ hủy được, dừng khẩn cấp |
| Pháp lý dữ liệu cá nhân | Endpoint xóa dữ liệu, chính sách, hỏi luật sư trước khi bán |
| Chưa kiểm chứng nhu cầu | Chạy thử với Page thật ở GĐ3; theo dõi mục tiêu kinh doanh riêng |
| TikTok chưa cấp quyền API hoặc thiếu API ẩn | Đăng ký từ GĐ0; Facebook/Instagram không phụ thuộc TikTok; spam trên TikTok chỉ đánh dấu nếu không có API ẩn |

## 11. Danh mục tài liệu

| # | Tài liệu |
|---|---|
| 01 | Tổng quan dự án (tài liệu này) |
| 02 | Yêu cầu nghiệp vụ (BRD) |
| 03 | Đặc tả sản phẩm (PRD) |
| 04 | User stories |
| 05 | Yêu cầu chức năng |
| 06 | Yêu cầu phi chức năng |
| 07 | Luồng người dùng |
| 08 | Đặc tả UI/UX |
| 09 | Kiến trúc hệ thống |
| 10 | Thiết kế database |
| 11 | Đặc tả API |
| 12 | Đặc tả tích hợp |
| 13 | Thiết kế bảo mật |
| 14 | Kế hoạch kiểm thử |
| 15 | Kiến trúc triển khai |
| 16 | Lộ trình phát triển |

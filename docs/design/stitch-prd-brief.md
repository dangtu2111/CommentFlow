# CommentFlow AI — PRD & Project Brief (bản xuất từ Stitch)

> Nguồn: dự án Stitch `15298527895734533184`, màn "CommentFlow AI - PRD & Project Brief (MVP)" (tải qua Stitch MCP ngày 06/11/2026). Đây là tài liệu thiết kế của chủ dự án; khi lệch với `docs/01–16`, `docs/01–16` thắng (ghi quyết định ở `docs/plans/quyet-dinh/`). Mọi việc giao diện (UI-FIRST) phải đọc file này cùng `design/stitch/<slug>.png|html` và `design/stitch/DESIGN.md`.

## Tóm tắt dùng khi dựng giao diện

- **Khẩu hiệu:** "Trả lời khách nhanh hơn, vẫn đúng giọng của shop."
- **Màu (tỉ lệ):** ~80% trung tính (nền `#F6F8F9`, thẻ `#FFFFFF`, chữ `#0F1C24`); ~15% Flow Teal `#0B7285` (hành động chính, mục đang chọn); ≤ 5% Spark Violet `#6741D9` — **chỉ dành cho AI** (mọi chỗ có sắc tím là có AI tham gia).
- **Chữ:** Be Vietnam Pro. **Lưới:** bội số 4px (4, 8, 12, 16, 24). **Bo góc:** 8px (nút/ô nhập), 12px (panel/modal), 999px (chip/huy hiệu).
- **Nguyên tắc bất biến:** AI không tự ẩn/xóa (chỉ quy tắc lọc SĐT/link do Owner bật; luôn có Bỏ ẩn); mọi câu AI kèm chip nguồn kiến thức; khóa chống trả lời trùng ("An đang xử lý"); cửa sổ 24 giờ (sau 24h chỉ nhân viên; sau 7 ngày khóa hẳn); Private Reply chỉ 1 tin trong 7 ngày; **MVP cấm tuyệt đối xóa bình luận trên mạng xã hội**.
- **Phân quyền Owner/Staff:** Staff không thấy mục kết nối kênh, mời thành viên, gói cước/thanh toán (403 nếu vào URL); Staff chỉ xem Cơ sở kiến thức, ma trận Tự động hóa, Quy tắc spam; Staff **được bấm Dừng khẩn cấp**; Báo cáo của Staff chỉ chỉ số cá nhân.

## 29 màn hình theo bản thiết kế

1. Bình luận (3 cột; 8 trạng thái; 6 nhãn ý định; độ tin cậy; phím tắt). 2. Tin nhắn (3 cột + ngăn khách hàng; đồng hồ 24h, <2h đổi màu). 3. Khách tiềm năng (Kanban 4 cột: Mới → Đã liên hệ → Đã chốt → Hủy).
4. Cơ sở kiến thức (đồng bộ Shopify, nạp URL chính sách, sản phẩm, bảng giá, từ điển viết tắt, giọng xưng hô, AI Test Lab). 5. Bài viết (gắn sản phẩm, ghi chú theo khung giờ livestream). 6. Tự động hóa (ma trận Tắt/Chạy thử/Tự động theo kênh × nhãn, khoảng trễ 1–5 phút, bộ đếm chi phí, Dừng khẩn cấp). 7. Quy tắc spam (lọc từ khóa, chặn link, tự ẩn SĐT, chạy thử).
8. Báo cáo hiệu suất & SLA. 9. Nhật ký hoạt động.
10. Cài đặt: thành viên & phân quyền. 11. Gói dịch vụ & thanh toán VietQR (Starter 299k, Growth 699k, Business 1.490k, mua thêm 149k/1.000 lượt — số liệu chỉ để thiết kế, nguồn thật là bảng `plans`). 12. Bảo mật & tài khoản (2FA, mã dự phòng, đổi mật khẩu, email bảo mật).
13. Onboarding 5 bước (Tạo Workspace → Kết nối kênh → Chọn Page → Nạp kiến thức nhanh → Mời đồng đội). 14. Email mời, thiết lập mật khẩu, chào mừng nhân viên. 15. Landing & bảng giá, chính sách bảo mật, điều khoản & DPA, trạng thái yêu cầu xóa dữ liệu. 16. 404, 403, cảnh báo token hết hạn & cấp lại quyền Meta. 17. Brand Guideline & thư viện component (kèm Tailwind config và CSS variables).

## Lưu ý khi chuyển thành code (quyết định của dự án)

- Số liệu, huy hiệu, tên đối tác, logo, cam kết trong ảnh thiết kế (ví dụ "Meta Tech Partner Certified", "500+ shop", "98.4%", ISO 27001) là **minh họa**; không đưa vào giao diện khi không có dữ liệu thật.
- Stack giao diện thật của repo: Next.js App Router + CSS theo token trong `apps/web/src/styles` (không bắt buộc Tailwind của bản xuất Stitch); i18n vi/en bắt buộc.
- Lộ trình trong bản Stitch (9 tuần) chỉ để tham khảo; lộ trình chính thức là `docs/16` và `docs/plans/MASTER.md`.

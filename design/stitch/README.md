# Thiết kế Stitch

Dự án Stitch: https://stitch.withgoogle.com/projects/15298527895734533184

## Tải về (tự động qua MCP)

Chạy `/stitch-sync` trong Claude Code ở GĐ0 (MCP Stitch đã cấu hình sẵn trên máy). Lệnh ghi HTML + ảnh từng màn hình vào thư mục này, tạo `manifest.json`, điền bảng bên dưới. Thiết kế đổi → chạy lại `/stitch-sync` (chỉ tải màn hình mới/đổi) hoặc `/stitch-sync <slug>`.

**Ngoài `/stitch-sync`, không gọi MCP Stitch khi code** — đọc file trong thư mục này.

## Xuất tay (nếu MCP lỗi)

1. Trong Stitch, với **từng màn hình**: xuất code HTML/Tailwind và ảnh chụp.
2. Đặt tên theo trang trong `docs/CommentFlow_UI_Design_Prompt.md`, ví dụ:
   - `comments.html` + `comments.png` (mục 7.1)
   - `messages.html` + `messages.png` (7.1b)
   - `knowledge-base.html` (7.3) · `posts.html` (7.3b) · `automation.html` (7.3c)
   - `admin-overview.html` … cho Admin Console
3. Nếu Stitch có DESIGN.md (màu, chữ, khoảng cách) → đặt tại `design/stitch/DESIGN.md`.
4. Điền bảng dưới, rồi thêm dòng tương ứng vào `docs/specs/README.md`.

## Quy tắc dùng khi code

- `/feature` chỉ đọc file của **đúng trang đang làm** (ưu tiên ảnh `.png` để xem bố cục; mở `.html` khi cần chi tiết class).
- HTML của Stitch là **bản tham chiếu bố cục**, không chép thẳng vào sản phẩm; dựng bằng component của repo, đủ trạng thái theo prompt UI (đang tải, lỗi, trống, khóa mềm…).
- Màu/chữ/khoảng cách lấy từ token trong code (tạo một lần từ `docs/08_UI_UX_Specification.md` §2), không đọc lại thiết kế để lấy màu.
- Màu Stitch khác bảng thương hiệu (Flow Teal #0B7285, Spark Violet #6741D9 chỉ cho AI) → ghi vào bảng dưới, chủ dự án chốt nguồn đúng.

## Bảng màn hình

| Màn hình | File | Mục trong prompt UI/Admin | Trạng thái đã vẽ | Còn thiếu |
|---|---|---|---|---|
| Chào mừng nhân viên mới | staff-welcome.html, staff-welcome.png | chưa khớp | |  |
| Lỗi 403 Staff vs Owner | error-403.html, error-403.png | 7.8 | |  |
| Cài đặt – Xác nhận tắt 2FA | settings-2fa-disable-modal.png | 7.6 | | thiếu .html; **nội dung bịa, không dùng:** "Meta Tech Partner / tạm ngưng sau 24 giờ", "8 mã dự phòng" (thật: 10 mã, tắt đòi mật khẩu, Owner/Admin không được tắt — ADR 004 §4) |
| Cài đặt – Tài khoản & Bảo mật | settings-security.png | 7.6 | | thiếu .html |
| Brand Guideline & Component Library | brand-guideline.html, brand-guideline.png | 4, 8 | |  |
| Báo cáo – Hiệu suất AI & SLA | reports.html, reports.png | 7.6b | |  |
| Chính sách bảo mật & xóa dữ liệu | privacy-data-deletion.html, privacy-data-deletion.png | 7.7 | |  |
| Trang chủ & Bảng giá | landing-pricing.html, landing-pricing.png | 7.7 | |  |
| Bình luận | comments.html, comments.png | 7.1 | Đã dựng một phần (`feat/inbox-list`): tab trạng thái + số thật, danh sách, tìm/lọc/sắp xếp, khung chi tiết trống | Cột phải đã dựng chi tiết thật + khóa mềm (`feat/inbox-detail`: chưa có bối cảnh bài/sản phẩm, nhãn/độ tin cậy/lý do AI, gợi ý AI, hành động, tự mở bình luận kế tiếp). **Chưa dựng (chưa có dữ liệu thật — không bịa):** SLA/ca làm việc/phím tắt, "Độ chính xác AI", huy hiệu "Có AI"/ADS giả, bối cảnh bài + sản phẩm, "Giao cho tôi", lọc nhãn AI, "N bình luận mới", chi tiết/trả lời/hành động hàng loạt (các mục MASTER riêng). **Thêm ngoài thiết kế:** tab **Mới** (`new`/`processing`) vì bình luận từ webhook ở trạng thái `new`; tab **Cần hỗ trợ thêm** theo docs/08 §4. Khung ứng dụng đã dựng ở `feat/app-shell` (sidebar chỉ liệt kê trang đã có; chưa có "AI tự động"/Dừng khẩn cấp/đồng hồ lượt AI/lọc kênh + tìm kiếm toàn cục — gap `SHELL-TOPBAR`) |
| Tự động hóa | automation.png | 7.3c | | thiếu .html |
| Đăng nhập & Đăng ký | auth-login-register.png | 7.7 (Công khai) | Đã dựng (`feat/auth-ui`) | thiếu .html. **Đã bỏ khi dựng (chủ dự án 03/11):** nút Facebook/Google, "Ghi nhớ 30 ngày", huy hiệu "Meta Tech Partner Certified", thống kê 500+/98.6%/18 giờ, "Dùng thử 14 ngày" |
| Kiểm tra email · Xác minh email · Quên mật khẩu · Đặt lại mật khẩu · 3 thư (xác minh, đặt lại, đã có tài khoản) | (chưa vẽ) | 7.7 (Công khai) | Dựng tạm theo khung thẻ của màn đăng nhập (`feat/auth-ui`) | **Chưa có thiết kế Stitch** — cần vẽ rồi `/stitch-sync` để so lại |
| Quy tắc spam | spam-rules.png | 7.4 | | thiếu .html |
| Onboarding 5 bước | onboarding.png | 7.2 | | thiếu .html |
| Email mời thành viên | email-invite.png | chưa khớp | | thiếu .html |
| Cài đặt – Đổi mật khẩu thành công | settings-password-changed.png | 7.6 | | thiếu .html |
| Cài đặt – Gói & Thanh toán VietQR | settings-billing.png | 7.6 | | thiếu .html |
| Chấp nhận lời mời & đặt mật khẩu | accept-invite.png | chưa khớp | | thiếu .html |
| Cài đặt – Đổi mật khẩu (modal) | settings-change-password-modal.png | 7.6 | | thiếu .html |
| Khách tiềm năng | leads.png | 7.6c | | thiếu .html |
| Nhật ký hoạt động | activity-log.png | 7.5 | | thiếu .html |
| Lỗi 404 | error-404.png | 7.8 | | thiếu .html |
| Email thông báo đổi mật khẩu | email-password-changed.png | chưa khớp | | thiếu .html |
| Cơ sở kiến thức | knowledge-base.png | 7.3 | | thiếu .html |
| Tin nhắn | messages.png | 7.1b | | thiếu .html |
| Điều khoản & DPA | terms-dpa.png | 7.7 | | thiếu .html |
| Bài viết | posts.png | 7.3b | | thiếu .html |
| Mất kết nối Fanpage | channel-disconnected.png | chưa khớp | | thiếu .html |
| Cài đặt – Thiết lập 2FA (modal) | settings-2fa-setup-modal.png | 7.6 | | thiếu .html |
| Cài đặt – Hệ thống & Thành viên | settings-workspace-members.png | 7.6 | | thiếu .html |

## Khác biệt với bảng thương hiệu

| Thuộc tính | Stitch | `08_UI_UX_Specification.md` | Chốt |
|---|---|---|---|
| Màu chính | primary `#005868`, primary-container `#0B7285` (guideline Stitch ghi `#0B7285` là primary-600); nút "Đăng nhập vào Workspace" trong `auth-login-register.png` dùng `#005868` | primary-600 `#0B7285` | **Chốt 03/11 (chủ dự án): theo `08` §2 — nút chính `#0B7285`**; token ở `apps/web/src/styles/tokens.css` |
| Màu AI | secondary `#633CD5` (token), `#6741D9` (guideline) | ai-600 `#6741D9` | |
| Nền trang | `#F5FAFF` | bg `#F6F8F9` | |
| Chữ chính | `#101D25` | text `#0F1C24` | |
| Viền | outline-variant `#BEC8CC`, surface-container-high `#DCEAF5` | border `#DDE3E7` | |
| Thang chữ | 11/12/13/15/18/22/30px | 12/14/16/20/24/32–40 | |
| Icon | Material Symbols | Lucide | |
| Trạng thái (success/warning/danger) | `#237A36` / `#B35C00` / `#C92A2A` | giống | Khớp |

## Đã bỏ khi dựng workspace / thành viên / lời mời (`feat/workspace-members`, chủ dự án 03/11)

Dựng tối giản, không chờ Stitch; các nội dung dưới đây trong `settings-workspace-members.png`, `accept-invite.png`, `onboarding.png` là **bịa hoặc ngoài phạm vi**, không đưa vào sản phẩm:

- Trang Thành viên: khối kênh đã kết nối, gói cước/hạn mức AI, "Chuyển khoản QR (VietQR)", "Xóa vĩnh viễn Workspace", "Ma trận đối chiếu quyền hạn" tĩnh, phân công kênh phụ trách khi mời, công tắc "Che bot số điện thoại" khi mời, tên/ảnh mẫu, cột "Quyền thao tác" văn bản bịa.
- Nhận lời mời: huy hiệu "Meta Tech Partner • ISO/IEC 27001", "Gateway SSL Active", "Bảo mật cấp doanh nghiệp Meta API Partner", hiển thị token mời, danh sách kênh/phạm vi quyền bịa, ô "Kích hoạt 2FA (Khuyên dùng)" trong form nhận lời mời (2FA làm ở trang bảo mật; Owner bắt buộc), quy tắc mật khẩu "8 ký tự" (thật: **tối thiểu 10**), đặt mật khẩu ngay trên trang mời (người chưa có tài khoản đăng ký ở trang đăng ký thường).
- Onboarding: chỉ dựng bước 1 (tạo workspace) — chưa có thiết kế Stitch riêng cho bước này; các bước 2–5 (kênh, kiến thức...) làm ở nhánh sau.
- Bộ chuyển workspace trong Stitch có tìm kiếm + số cần xử lý: bản này chỉ liệt kê (gap matrix `FR-005-SEARCH`).

# 13 — Thiết kế bảo mật

> Phiên bản 0.7 · 02/11/2026 (bổ sung: saas-core, feature flag, đối soát Shopify, bảo vệ Meta App, kiểm tra lại trước khi gửi) · Áp dụng cho `web`, `worker`, `ml`, Admin Console và quy trình phát triển với Claude Code.

## 1. Mô hình đe dọa (tóm tắt)

| Tài sản | Mối đe dọa | Biện pháp chính |
|---|---|---|
| Page/Shopify token | Lộ DB, lộ log, máy dev | AES-GCM, khóa ngoài DB, không log, không có ở máy dev |
| Dữ liệu khách của shop | Truy cập chéo workspace | RLS + kiểm thành viên + test CI |
| Tài khoản Owner/Admin | Chiếm tài khoản | 2FA bắt buộc, rate limit, phiên ngắn cho Admin |
| Pipeline AI | Prompt injection trong bình luận | Cổng tự gửi bằng code, guard, nội dung khách đặt trong khối dữ liệu |
| Pipeline AI | Cài lệnh gián tiếp qua kiến thức nhập vào (Excel, Sheets, trang crawl, mô tả sản phẩm connector) | Nguồn trong khối dữ liệu có thẻ; quét mẫu câu lệnh khi nhập → `injection_suspected`, không tự xuất bản, hàng chờ duyệt; guard số tiền/nguồn vẫn chặn đầu ra (FR-164) |
| Webhook | Giả mạo sự kiện | Xác minh HMAC, idempotency |
| Chi phí AI | Lạm dụng/vòng lặp | skipOwnPage, trần chi phí, hạn mức lượt |
| Meta App dùng chung | Một shop spam/vi phạm làm Meta hạn chế cả app | Giới hạn tốc độ theo Page, phát hiện lạm dụng, tạm khóa gửi (09 §11) |
| Câu trả lời đã duyệt | Trạng thái đổi trong khoảng trễ (giá đổi, đã có người trả lời, dừng khẩn cấp) | `sendRecheck` ngay trước khi gửi (09 §6.1) |
| Thanh toán | Xác nhận nhầm | Nội dung CK bắt buộc, cảnh báo lệch tiền, nhật ký |

## 2. Xác thực

- Thư viện: **Better Auth** (ADR 001); các điểm lệch so với bản thiết kế ban đầu chốt ở ADR 003 (03/11).
- Mật khẩu: argon2id (Better Auth mặc định scrypt → **cấu hình hàm băm/kiểm tùy chỉnh bằng argon2id**); tối thiểu 10 ký tự; kiểm danh sách mật khẩu lộ.
- Phiên: cookie httpOnly, Secure, SameSite=Lax, **ký HMAC** bằng `BETTER_AUTH_SECRET` (khóa trong env/secret manager, không trong DB, xoay được); token phiên lưu thô trong DB (Better Auth không băm) — chấp nhận vì lộ riêng DB không dựng được cookie hợp lệ; **tắt cookie cache** để thu hồi phiên có hiệu lực ngay; hết hạn 14 ngày (app), 8 giờ (Admin, đặt bằng hook khi tạo phiên `is_admin_session`); ghi `last_seen_at` tối đa 1 lần/giờ; xoay phiên khi đăng nhập/đổi quyền; xóa mọi phiên khi đổi mật khẩu.
- Sao lưu DB và DB staging/dev **không** được lưu cùng chỗ với `BETTER_AUTH_SECRET`.
- 2FA TOTP: **bắt buộc Owner và mọi Admin** — Better Auth không ép theo vai trò nên app tự chặn (middleware: Owner/Admin chưa bật 2FA chỉ vào được trang cài 2FA); Staff tùy chọn; 10 mã dự phòng (lưu băm nếu plugin cho phép hàm tùy chỉnh, không thì mã hóa AES-GCM — ghi rõ ở ADR 003). "Xem như khách" của Admin **tự viết** theo §3.2 (chỉ đọc, 30 phút), không dùng impersonation của plugin admin.
- Rate limit (Redis): đăng nhập 5 lần/15 phút/IP+email; quên mật khẩu 3 lần/giờ.
- Google Sheets chỉ xin quyền đọc (`spreadsheets.readonly` hoặc `drive.file`), có thể cần Google xác minh app.
- OAuth nền tảng: tham số `state` ký + hết hạn 10 phút; kiểm redirect URI cố định.

## 3. Phân quyền

### 3.1 App khách

| Hành động | Owner | Staff |
|---|---|---|
| Xem/xử lý bình luận, tin nhắn | ✅ | ✅ |
| Gửi, ẩn, bỏ qua, đổi nhãn | ✅ | ✅ |
| Hủy câu sắp tự gửi, Đánh dấu sai | ✅ | ✅ |
| Dừng khẩn cấp | ✅ | ✅ |
| Bật lại sau dừng khẩn cấp | ✅ | ❌ |
| Khách tiềm năng (xem, cập nhật) | ✅ | ✅ |
| Xuất Excel khách tiềm năng | ✅ | ❌ |
| Bài viết: gắn sản phẩm, ghi chú | ✅ | ✅ (cấu hình được) |
| Kiến thức: sửa bản nháp | ✅ | ❌ |
| Kiến thức: xuất bản, khôi phục | ✅ | ❌ |
| Tự động hóa: đổi chế độ, ngưỡng | ✅ | ❌ |
| Quy tắc spam | ✅ | ❌ |
| Kênh, thành viên, thanh toán, xóa/xuất dữ liệu | ✅ | ❌ |
| Báo cáo | ✅ | ✅ (không thấy chi phí) |
| Nhật ký | ✅ | ❌ |

Kiểm quyền ở server (middleware theo route + kiểm trong service), không dựa vào ẩn nút ở UI.

### 3.2 Admin Console

| Quyền | Super Admin | Support | Finance |
|---|---|---|---|
| Tổng quan, danh sách workspace | ✅ | ✅ | ✅ |
| Xem như khách (chỉ đọc) | ✅ | ✅ | ❌ |
| Xác nhận thanh toán, hóa đơn | ✅ | ❌ | ✅ |
| Lãi gộp, trần chi phí AI | ✅ | ❌ | ✅ (xem) / ❌ (sửa) |
| Dead letter, cấu hình hệ thống | ✅ | ❌ | ❌ |
| Tạm khóa workspace | ✅ | ❌ | ❌ |
| Tạm khóa gửi theo kênh | ✅ | ✅ | ❌ |
| Feature flag (sửa) | ✅ | ❌ | ❌ |
| Xử lý tín hiệu lạm dụng | ✅ | ✅ | ❌ |
| Nhật ký admin | ✅ | ❌ | ❌ |

**Xem như khách:** bắt buộc lý do; chỉ đọc; tối đa 30 phút; dải cảnh báo cố định; mọi truy cập ghi `admin_impersonations` + `action_logs`; Owner thấy lịch sử trong Nhật ký.

## 4. Cô lập dữ liệu (multi-tenant)

- RLS trên mọi bảng có `workspace_id` (xem `10_Database_Design.md` §4).
- Role DB ứng dụng không có `BYPASSRLS`, không phải owner bảng.
- Worker đặt `app.workspace_id` cho từng job; job không có workspace → chỉ chạy được bảng hệ thống.
- Cache key, khóa Redis, tên file lưu trữ, virtual key LiteLLM **luôn chứa `workspace_id`**.
- Test CI: (1) mọi bảng có policy; (2) user workspace A gọi mọi endpoint với id của B → 404.
- Ngữ cảnh người dùng `app.user_id` (do `withUser()` đặt) chỉ để liệt kê dữ liệu **của chính mình**; đọc chéo workspace chỉ khi **không** có `app.workspace_id` (chi tiết và trạng thái áp dụng: `10_Database_Design.md` §4).
- Role `cf_app` không có quyền DELETE trên `workspaces`/`users`/`members` và không UPDATE `users.is_admin`/`admin_role`.

## 5. Mã hóa & bí mật

| Dữ liệu | Cách bảo vệ |
|---|---|
| Page/IG/TikTok/Shopify/Google/Haravan/Sapo/KiotViet/Pancake token, API key | AES-256-GCM, nonce ngẫu nhiên, `key_version`; khóa trong env/secret manager, không trong DB |
| TOTP secret | XChaCha20-Poly1305 của Better Auth (khóa dẫn xuất từ `BETTER_AUTH_SECRET`; chấp nhận thay AES-GCM, ADR 003). Đổi `BETTER_AUTH_SECRET` làm hỏng secret 2FA đã lưu → chỉ xoay khi có quy trình mã hóa lại hoặc buộc cài lại 2FA |
| SĐT khách tiềm năng | Mã hóa + lưu `phone_last4` để tìm |
| Mật khẩu, mã dự phòng, token mời | Hash |
| Truyền tải | TLS 1.2+ (Caddy tự cấp chứng chỉ), HSTS |
| Sao lưu | Mã hóa trước khi đẩy lên lưu trữ ngoài |

Xoay khóa: hỗ trợ nhiều `key_version`; job mã hóa lại dần.

## 6. Bảo vệ ứng dụng web

- Validate mọi input bằng Zod; truy vấn tham số hóa (không nối chuỗi SQL).
- Chống XSS: React escape mặc định; không `dangerouslySetInnerHTML` với nội dung khách; CSP chặt.
- CSRF token cho phương thức ghi; kiểm `Origin`.
- Header: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- Upload Excel/CSV: giới hạn kích thước (10 MB), kiểm MIME, parse ở worker, không thực thi công thức/macro.
- Crawl URL: chặn SSRF — chỉ http/https, phân giải DNS rồi chặn IP nội bộ/loopback/metadata, giới hạn redirect.

## 7. An toàn AI

- Nội dung khách đặt trong khối dữ liệu có đánh dấu; system prompt nói rõ không làm theo chỉ dẫn trong khối này.
- LLM chỉ trả JSON theo schema; mọi quyết định gửi do code (cổng `09_System_Architecture.md` §6).
- Guard: số tiền trong câu trả lời phải xuất hiện trong nguồn; chặn link/SĐT không có trong kiến thức; chặn từ khóa cấm.
- **AI không bao giờ tự ẩn** bình luận; chỉ quy tắc do Owner bật mới tự ẩn.
- Che PII (SĐT VN `0[35789]\d{8}` và dạng +84, email, số tài khoản) trước khi gửi LLM/Langfuse; khôi phục khi cần ở phía server.
- Trần chi phí theo workspace; vượt → tắt tự gửi.

## 8. Webhook & tích hợp

- Xác minh chữ ký (Meta `X-Hub-Signature-256`, Shopify HMAC) bằng so sánh thời gian hằng.
- Idempotency theo `event_hash`; bỏ sự kiện quá cũ.
- Dữ liệu từ webhook là dữ liệu không tin cậy; không dùng để quyết định quyền.

## 9. Nhật ký & giám sát

- `action_logs` cho mọi hành động ghi (người, AI, hệ thống, admin); không sửa/xóa được từ app.
- Log ứng dụng có cấu trúc; **không log token, mật khẩu, nội dung PII thô**.
- Cảnh báo: đăng nhập thất bại hàng loạt, lỗi webhook chữ ký, gửi lỗi liên tiếp, chi phí AI tăng đột biến, truy cập Admin ngoài giờ.

## 10. Quyền riêng tư & pháp lý

- Chính sách quyền riêng tư, Điều khoản, DPA (shop là bên kiểm soát, CommentFlow là bên xử lý).
- Tuân thủ Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và văn bản hướng dẫn **(cần luật sư xác nhận nghĩa vụ cụ thể trước khi bán)**.
- Meta data deletion callback + trang tra cứu; Shopify GDPR webhooks.
- Thời gian lưu dữ liệu (đề xuất 12 tháng); xóa workspace → xóa dữ liệu trong 30 ngày, sao lưu hết hạn theo vòng.
- Xuất dữ liệu cho Owner.

## 11. Bảo mật quy trình phát triển (Claude Code + ECC)

- Không đặt token production trên máy dev hoặc trong repo; `.env*` trong `.gitignore`.
- Cấu hình Claude Code chặn đọc `.env*` và thư mục secret (`permissions.deny`).
- Cài ECC chỉ từ repo chính thức `affaan-m/ECC` hoặc gói `ecc-universal`; **đọc hook trước khi bật**.
- Không dùng lệnh gửi diff ra dịch vụ ngoài (ví dụ `/astra-review`).
- Migration production chỉ chạy qua CI có duyệt tay.
- Giữ thông báo MIT với mọi đoạn code lấy từ Customer-Support-AI-Employee.
- Quét phụ thuộc (npm audit / pip-audit), secret scanning (gitleaks) trong CI; agent `security-reviewer` cho PR chạm auth, token, RLS.

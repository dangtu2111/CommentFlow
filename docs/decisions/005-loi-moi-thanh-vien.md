# 005 — Workspace, thành viên và lời mời (03/11/2026)

Trạng thái: **Đã chốt** (chủ dự án, 03/11, duyệt kế hoạch `feat-workspace-members`). Căn cứ: `docs/10` §3.1, §4; `docs/13` §2–§4; FR-002…005; ADR 003, 004.

## 1. Lời mời

| Mục | Quyết định |
|---|---|
| Ai mời | **Owner** (đã qua cổng 2FA của `requireAppUser`), theo email + vai trò `owner`/`staff` |
| Token | 32 byte ngẫu nhiên (base64url, 43 ký tự); **DB chỉ lưu SHA-256** (`invitations.token_hash`); token thô chỉ có trong thư |
| Hạn / dùng | **7 ngày**, dùng **một lần** (`accepted_at`), thu hồi bằng `revoked_at` (không DELETE) |
| Mời lại | Cùng email → thu hồi lời mời đang chờ rồi tạo mới (token cũ mất hiệu lực); chỉ mục duy nhất một lời mời đang chờ cho mỗi `(workspace, email)` |
| Rate limit | Gửi: **20/giờ/workspace** và **3/ngày/email** (kho lỗi → từ chối). Nhận: **10 lần/15 phút/người dùng** |
| Nhận | Phải đăng nhập bằng tài khoản có **email đã xác minh và trùng email được mời**. Chưa có tài khoản: đăng ký → xác minh email (vẫn bắt buộc) → quay lại nhận; cookie ký `cf-invite` (HKDF nhãn `invite-cookie/v1`, 48 giờ) nhớ token qua các bước |
| Phản hồi | Mọi ca không hợp lệ (token sai, hết hạn, đã dùng, thu hồi, email không khớp, chưa xác minh, thành viên đang bị tạm khóa) trả **cùng một kết quả** — không lộ email nào đã có tài khoản. Mời email đã là thành viên: kết quả y hệt, không gửi thư |

## 2. Hàm DB nhận lời mời (migration 0015)

Nhận lời mời phải đọc `invitations` khi người nhận chưa thuộc workspace nào — ngoài ngữ cảnh `withWorkspace`. Giải pháp hẹp nhất (thay vì cho `cf_app` đọc chéo workspace hay mở rộng `cf_auth`):

- `core.accept_invitation(p_token_hash text)` và `core.invitation_preview(p_token_hash text)`: `SECURITY DEFINER`, `SET search_path = pg_catalog, core`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE` **chỉ cho `cf_app`** (`cf_auth` không có).
- `accept_invitation` **không nhận email hay user id**: người dùng lấy từ `app.user_id` (do `withUser()` đặt từ phiên đã xác thực phía server) và **đòi không có `app.workspace_id`**; email + `email_verified` đọc từ `core.users` ngay trong hàm rồi so khớp (không phân biệt hoa/thường). Khóa dòng lời mời `FOR UPDATE` để dùng một lần kể cả khi chạy song song.
- Trả `(workspace, vai trò mới, vai trò cũ, người mời)`; mọi ca không hợp lệ trả **0 dòng**. `invitation_preview` chỉ trả tên workspace + vai trò (không email).
- Ghi `action_logs` (`invitation.accepted`) trong cùng giao dịch.

Quyền `cf_app` trên `invitations`: SELECT/INSERT + UPDATE đúng cột `revoked_at`; không DELETE; INSERT không được tạo sẵn lời mời đã dùng/thu hồi; `check-rls` đỏ nếu cấp lại quyền cột nhạy cảm.

## 3. Owner cuối cùng và thông báo Owner

- Trigger `core.guard_last_owner` (BEFORE UPDATE/DELETE trên `members`): workspace luôn còn ≥ 1 Owner `active`; khóa dòng `workspaces` để hai giao dịch song song không cùng vượt qua; xóa cascade cả workspace không bị chặn.
- Owner **không tự** đổi vai trò/tạm khóa/gỡ chính mình (không có "tự rời workspace" ở nhánh này — gap matrix `MEMBER-LEAVE`).
- **Mỗi lần thêm / đổi vai trò / tạm khóa / mở khóa / gỡ một Owner**: ghi `action_logs` và gửi email tới **tất cả Owner đang hoạt động** (cộng người vừa mất vai trò Owner); thư gửi nền, chỉ chứa tên người và workspace, không token.
- Kiểm quyền "chỉ Owner" ở tầng dịch vụ (`createWorkspaceAdmin`), vì `withWorkspace` không đặt `app.user_id` — đề xuất bảo vệ sâu hơn ở DB là gap matrix `RLS-ACTOR-CTX`.

## 4. Chọn workspace và `requireAppUser()`

- Workspace đang dùng = cookie ký `cf-workspace` chỉ chứa id; khóa **dẫn xuất bằng HKDF-SHA256 từ `BETTER_AUTH_SECRET` với nhãn riêng** (`workspace-cookie/v1`), không dùng secret gốc. Mỗi request đọc lại danh sách workspace `active` của người dùng (`withUser`); id không còn thuộc về mình bị bỏ qua.
- `requireAppUser({ workspace, role, twoFactor })` là cổng duy nhất của `/app`: phiên → email đã xác minh → 2FA (Owner/`is_admin`) → membership `active` → vai trò (sai vai trò → 404). Test quét `require-app-user.scan.test.ts` ép mọi trang/route/Server Action dưới `app/app/**` phải gọi nó.
- Múi giờ workspace: danh sách có chủ đích (`WORKSPACE_TIME_ZONES`), so khớp đúng chữ.

## 5. Còn lại / không làm ở nhánh này

Tìm kiếm + "số cần xử lý" của bộ chuyển workspace (FR-005), tự rời workspace, bảo vệ sâu "ai là người gọi" ở DB — xem gap matrix.

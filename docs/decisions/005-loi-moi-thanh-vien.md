# 005 — Workspace, thành viên và lời mời (03/11/2026)

Trạng thái: **Đã chốt** (chủ dự án, 03/11, duyệt kế hoạch `feat-workspace-members`). Căn cứ: `docs/10` §3.1, §4; `docs/13` §2–§4; FR-002…005; ADR 003, 004.

## 1. Lời mời

| Mục | Quyết định |
|---|---|
| Ai mời | **Owner** (đã qua cổng 2FA của `requireAppUser`), theo email + vai trò `owner`/`staff` |
| Token | 32 byte ngẫu nhiên (base64url, 43 ký tự); **DB chỉ lưu SHA-256** (`invitations.token_hash`); token thô chỉ có trong thư |
| Hạn / dùng | **7 ngày**, dùng **một lần** (`accepted_at`), thu hồi bằng `revoked_at` (không DELETE) |
| Mời lại | Cùng email → thu hồi lời mời đang chờ rồi tạo mới (token cũ mất hiệu lực); chỉ mục duy nhất một lời mời đang chờ cho mỗi `(workspace, email)` |
| Rate limit | Gửi: **20/giờ/workspace**, **20/giờ/người mời** (không nhân hạn mức bằng nhiều workspace) và **3/ngày cho mỗi (workspace, email)** (kho lỗi → từ chối). Tạo workspace: **5/ngày/người dùng**. Nhận: **10 lần/15 phút/người dùng** |
| Nhận | Phải đăng nhập bằng tài khoản có **email đã xác minh và trùng email được mời**. Chưa có tài khoản: đăng ký → xác minh email (vẫn bắt buộc) → quay lại nhận; cookie ký `cf-invite` (HKDF nhãn `invite-cookie/v1`, 48 giờ) nhớ token qua các bước; **dùng một lần**: `/app` chuyển qua `/invite/resume` xóa cookie rồi mới tới trang lời mời; người đã đăng nhập bấm link `/start` thì không bị đặt cookie |
| Phản hồi | Mọi ca không hợp lệ (token sai, hết hạn, đã dùng, thu hồi, email không khớp, chưa xác minh, thành viên đang bị tạm khóa) trả **cùng một kết quả** — không lộ email nào đã có tài khoản. Mời email đã là thành viên: kết quả y hệt, không gửi thư |

## 2. Hàm DB nhận lời mời (migration 0015)

Nhận lời mời phải đọc `invitations` khi người nhận chưa thuộc workspace nào — ngoài ngữ cảnh `withWorkspace`. Giải pháp hẹp nhất (thay vì cho `cf_app` đọc chéo workspace hay mở rộng `cf_auth`):

- `core.accept_invitation(p_token_hash text)` và `core.invitation_preview(p_token_hash text)`: `SECURITY DEFINER`, `SET search_path = pg_catalog, core`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE` **chỉ cho `cf_app`** (`cf_auth` không có).
- `accept_invitation` **không nhận email hay user id**: người dùng lấy từ `app.user_id` (do `withUser()` đặt từ phiên đã xác thực phía server) và **đòi không có `app.workspace_id`**; email + `email_verified` đọc từ `core.users` ngay trong hàm rồi so khớp (không phân biệt hoa/thường). Khóa dòng lời mời `FOR UPDATE` để dùng một lần kể cả khi chạy song song.
- Trả `(workspace, vai trò mới, vai trò cũ, người mời)`; mọi ca không hợp lệ trả **0 dòng**. `invitation_preview` chỉ trả tên workspace + vai trò (không email).
- Ghi `action_logs` (`invitation.accepted`) trong cùng giao dịch. Bỏ qua workspace `deleted`. **Thành viên đang `active` nhận lời mời KHÔNG bị hạ vai trò** (chỉ được nâng staff→owner); thành viên đã `removed` được kích hoạt lại với vai trò của lời mời; `suspended` không tự mở khóa. Giữ `invited_by` cũ nếu lời mời không có.
- `search_path = pg_catalog, core, pg_temp`; `check-rls` đỏ nếu hàm DEFINER mất search_path/pg_temp, do `cf_app`/`cf_auth` sở hữu, hoặc trigger Owner cuối bị gỡ/tắt.

Quyền `cf_app` trên `invitations`: SELECT/INSERT + UPDATE đúng cột `revoked_at`; không DELETE; INSERT không được tạo sẵn lời mời đã dùng/thu hồi; `check-rls` đỏ nếu cấp lại quyền cột nhạy cảm.

## 3. Owner cuối cùng và thông báo Owner

- Trigger `core.guard_last_owner` (BEFORE UPDATE/DELETE trên `members`): workspace luôn còn ≥ 1 Owner `active`; khóa dòng `workspaces` bằng `FOR NO KEY UPDATE` (không xung đột `FOR KEY SHARE` của INSERT bảng con → không deadlock; chỉ đúng ở READ COMMITTED, mặc định của `withWorkspace`/`withUser`) để hai giao dịch song song không cùng vượt qua; xóa cascade cả workspace không bị chặn.
- Owner **không tự** đổi vai trò/tạm khóa/gỡ chính mình (không có "tự rời workspace" ở nhánh này — gap matrix `MEMBER-LEAVE`).
- **Mỗi lần thêm / đổi vai trò / tạm khóa / mở khóa / gỡ một Owner**: ghi `action_logs` và gửi email tới **tất cả Owner đang hoạt động** (cộng người vừa mất vai trò Owner); thư gửi nền, chỉ chứa tên người và workspace, không token.
- **Chỉ-Owner được ép ở CẢ HAI tầng (feat/rls-actor-ctx, migration 0016):** dịch vụ (`createWorkspaceAdmin`, kiểm `assertOwner` + thông báo dễ hiểu) và DB (RLS). `withActor(workspaceId, userId, fn)` đặt `app.workspace_id` + `app.user_id`; policy của `members` (INSERT/UPDATE), `invitations` (SELECT/INSERT/UPDATE), `workspaces` (UPDATE) đòi `core.is_workspace_owner()` (hàm SECURITY DEFINER, tránh đệ quy RLS); `members` INSERT có đường khởi tạo cho Owner đầu tiên (`workspace_has_members`); `action_logs` người ghi không giả được người khác; `invitations.token_hash` không đọc được bằng `cf_app`. `check-rls` đỏ nếu các policy này bị gỡ hay hạ xuống chỉ theo workspace.
- **Giới hạn đã chấp nhận (chủ dự án, 03/11):** `app.user_id` vẫn do mã ứng dụng đặt. Cơ chế này chống QUÊN kiểm quyền và SAI id (IDOR) trong mã web/worker; nó KHÔNG chống một tiến trình web đã bị chiếm hoàn toàn (kẻ đó tự đặt được `app.user_id` của một Owner). Chống kịch bản đó cần tách role/chữ ký ngữ cảnh ở DB — ngoài phạm vi, ghi gap matrix nếu cần.
- UPDATE bị RLS ẩn dòng trả **0 dòng, không lỗi**: dịch vụ phải kiểm số dòng bị tác động (`returning`) và coi 0 dòng là bị từ chối (đã làm ở đổi vai trò/trạng thái, thu hồi lời mời).

## 4. Chọn workspace và `requireAppUser()`

- Workspace đang dùng = cookie ký `cf-workspace` chỉ chứa id; khóa **dẫn xuất bằng HKDF-SHA256 từ `BETTER_AUTH_SECRET` với nhãn riêng** (`workspace-cookie/v1`), không dùng secret gốc. Mỗi request đọc lại danh sách workspace `active` của người dùng (`withUser`); id không còn thuộc về mình bị bỏ qua.
- `requireAppUser({ workspace, role, twoFactor })` là cổng duy nhất của `/app`: phiên → email đã xác minh → 2FA (Owner/`is_admin`) → membership `active` → vai trò (sai vai trò → 404). Test quét `require-app-user.scan.test.ts` ép mọi trang/route/Server Action dưới `app/app/**` phải gọi nó.
- Múi giờ workspace: danh sách có chủ đích (`WORKSPACE_TIME_ZONES`), so khớp đúng chữ.

## 5. Ghi nhận sau kiểm chứng độc lập

- Chuyển Owner trước khi xóa người dùng: trigger chặn xóa (cascade) người là Owner `active` cuối cùng — quy trình xóa tài khoản (docs/13 §10) phải chuyển quyền trước.
- Token mời nằm trên URL: `Referrer-Policy: no-referrer` + `no-store` cho `/invite/*`; staging/production phải che đường dẫn `/invite/*` trong log Caddy (gap matrix H5).
- Đổi vai trò/tạm khóa/gỡ không xoay phiên: quyền có hiệu lực ngay vì `requireAppUser` đọc membership mỗi request; phiên không mang vai trò workspace.

## 6. Còn lại / không làm ở nhánh này

Tìm kiếm + "số cần xử lý" của bộ chuyển workspace (FR-005), tự rời workspace, bảo vệ sâu "ai là người gọi" ở DB — xem gap matrix.

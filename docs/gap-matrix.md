# Gap matrix — spec ↔ code

> Nguồn sự thật duy nhất về "cái gì đã có / còn thiếu". Dự án làm mới từ đầu → lập lần đầu thành **danh sách việc theo `16_Development_Roadmap.md` §3** (tất cả "Thiếu"); sau đó **chỉ sửa dòng** khi làm xong/đổi một mục.

Trạng thái: Đã có · Một phần · Khác spec · Thiếu · Không chắc · ✅ Xong (đã làm trong dự án này)

| Mã | Yêu cầu | Trạng thái | Bằng chứng (file:dòng) | Việc cần làm | Ước lượng | GĐ | Nhánh |
|---|---|---|---|---|---|---|---|
| AUTH-2FA | 2FA TOTP + 10 mã dự phòng, bắt buộc Owner/Admin (13 §2, ADR 003) | Thiếu | — | Plugin twoFactor (`storeBackupCodes: "encrypted"`), bảng `two_factors`, middleware ép Owner/Admin |  | 0 | chore/scaffold (chừa chỗ) |
| AUTH-RATELIMIT | Rate limit đăng nhập 5 lần/15 phút theo IP+email (Valkey, khóa `sys:`); quên mật khẩu 3 lần/giờ (13 §2) | Thiếu | — | Lớp tự làm trên Valkey nếu rate limiter của Better Auth không khóa theo email |  | 0 | chore/scaffold (chừa chỗ) |
| AUTH-FORGOT | Quên mật khẩu (dùng bảng `verifications`) | Thiếu | — | Luồng email + token; cần `notify` |  | 0 |  |
| AUTH-INVITE | Lời mời thành viên (bảng `invitations`; nhận lời mời bằng token ngoài ngữ cảnh workspace cần hàm SECURITY DEFINER hoặc đường riêng) | Thiếu | — | Nhánh sau tenancy |  | 0 |  |
| AUTH-ADMIN-SESSION | Phiên Admin 8 giờ (`is_admin_session`, hook tạo phiên) + "Xem như khách" tự viết (13 §3.2) | Thiếu | — | Hook `databaseHooks.session.create.before`; bảng `admin_impersonations` |  | 3 |  |

## Quyết định cần chủ dự án

| # | Spec nói | Code đang làm | Đề xuất | Quyết định |
|---|---|---|---|---|

## Theo dõi chi phí Claude Code (cuối tuần)

| Tuần | Chi phí | Số mục xong | Số lần gọi verifier | Ghi chú (phiên bất thường, đọc lại nhiều) |
|---|---|---|---|---|

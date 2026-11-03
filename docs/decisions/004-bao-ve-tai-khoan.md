# 004 — Bảo vệ tài khoản: rate limit, nguồn IP, mật khẩu lộ, 2FA (03/11/2026)

Trạng thái: **Đã chốt** (chủ dự án, 03/11). Căn cứ: `docs/13_Security_Design.md` §2, ADR 001 (ngoại lệ khóa `sys:`), ADR 003, kế hoạch `feat-auth-security`. Mục "Bằng chứng" và "Danh sách mật khẩu cục bộ" được điền khi làm từng mốc.

## 1. Rate limit

| Hành động | Xô (bucket) | Ngưỡng | Ghi chú |
|---|---|---|---|
| Đăng nhập | IP + email | 5 lần / 15 phút | theo spec `13` §2; chỉ khi biết IP |
| Đăng nhập | **email** | 10 lần / 15 phút | ngưỡng cao hơn xô IP; đổi IP không vượt được; **chỉ khóa tạm** (tự hết), không khóa tài khoản vĩnh viễn |
| Đăng ký | IP / email | 5 / giờ · 3 / giờ | |
| Quên mật khẩu | email | 3 / giờ | theo spec |
| Gửi lại thư xác minh | email | 3 / giờ | |
| Nhập mã 2FA | người dùng | 5 / 15 phút | mốc M3 |

- **Khóa Valkey:** tiền tố `sys:` (ngoại lệ nguyên tắc #2 của ADR 001: chưa có workspace lúc đăng nhập), sau đó là `rl:<hành động>:<xô>:<HMAC-SHA256 của danh tính>`; **không bao giờ chứa email/IP thô** (nguyên tắc #6). Khóa của môi trường có thêm tiền tố `REDIS_KEY_PREFIX` (`dev:`…). Cửa sổ cố định: `INCR` + `EXPIRE` ở lần đầu (script Lua một lệnh); lần thử bị chặn **không** kéo dài thời gian khóa.
- **Phản hồi khi bị chặn không lộ email có tồn tại:** đăng nhập và nhập mã 2FA báo "thử quá nhiều lần, đợi N phút" như nhau cho mọi email; đăng ký, quên mật khẩu, gửi lại thư trả **đúng thông báo trung tính** như bình thường và **không gửi thư**. Nhờ xô theo email áp như nhau cho email có thật và email lạ, kẻ xấu không phân biệt được; đánh đổi đã chấp nhận: kẻ xấu có thể làm người dùng thật bị chặn đăng nhập tạm thời (tối đa 15 phút/lượt).
- **Đăng nhập thành công** xóa bộ đếm IP+email và email của danh tính đó.
- **Valkey không dùng được:** đăng nhập/2FA chuyển sang bộ đếm trong bộ nhớ của tiến trình (cùng ngưỡng) + **log cảnh báo** (không PII); đăng ký/quên mật khẩu/gửi lại thư **không gửi thư**.

## 2. Nguồn địa chỉ IP

**Quyết định:** không dựng server tùy biến để lấy IP kết nối; không tin `X-Forwarded-For`/`X-Real-IP` do client gửi; **không dùng khóa chung "unknown"**.

| Môi trường | IP lấy từ | Xô dùng |
|---|---|---|
| **Dev / LAN** (không ra internet) | không lấy IP | **chỉ xô theo email** |
| **Staging / production** (qua Cloudflare Tunnel) | header `CF-Connecting-IP` do Cloudflare ghi đè | xô IP + email và xô email |

- `CF-Connecting-IP` chỉ được tin khi `APP_ENV=staging` (và production khi triển khai, kèm quyết định riêng); cấu hình nguồn này ở môi trường khác bị từ chối lúc khởi động.
- **Điều kiện hạ tầng bắt buộc:** cổng web **không publish** ra ngoài; chỉ `cloudflared` cùng mạng Docker truy cập được web. Nếu web truy cập được trực tiếp, kẻ xấu tự đặt `CF-Connecting-IP` và vượt rate limit.
- IP được chuẩn hóa trước khi làm khóa: IPv6 gom theo /64, chữ thường, dạng `::ffff:a.b.c.d` về IPv4.
- `sessions.ip` chỉ ghi IP đã tin cậy; header `X-Forwarded-For` của client bị xóa/ghi đè trước khi gửi cho Better Auth.

### Bằng chứng (03/11/2026, Next 16.4.4, `next dev`, chạy thử một route handler tạm, đã xóa)

| Phép thử | Kết quả |
|---|---|
| Gọi từ `127.0.0.1`, không gửi header | Next **tự đặt** `x-forwarded-for: ::ffff:127.0.0.1` (cùng `x-forwarded-host/port/proto`) |
| Gọi từ IP LAN với `X-Forwarded-For: 6.6.6.6` do client tự đặt | Handler thấy đúng `6.6.6.6` — Next **giữ nguyên giá trị của client, không nối IP socket** |
| Trường IP riêng | `request.ip` không tồn tại; không có `x-real-ip` |

→ ở dev, Next **không cung cấp IP kết nối đáng tin** (header có thể do client đặt), đúng điều kiện chủ dự án đã định trước ("Next không cho IP kết nối ở dev → chỉ xô theo email").

## 3. Mật khẩu đã lộ (mốc M2, đã làm)

- Áp dụng khi **đăng ký** và **đặt lại mật khẩu**; **không** áp dụng khi đăng nhập (tài khoản cũ có mật khẩu yếu vẫn vào được; nên đổi sau). Đăng ký: kiểm **sau** cổng rate limit (không để đăng ký thành máy gọi HIBP không giới hạn) và kết quả không phụ thuộc email có tồn tại; đặt lại: kiểm **trước** khi dùng token nên mật khẩu bị từ chối không làm mất token.
- **Have I Been Pwned k-anonymity** (đã duyệt gọi dịch vụ ngoài): `GET https://api.pwnedpasswords.com/range/<5 ký tự đầu của SHA-1 viết hoa>`, `Add-Padding: true`, `redirect: 'error'`, host cố định (không SSRF); chỉ 5 ký tự băm rời máy, mật khẩu và 35 ký tự còn lại **không bao giờ** rời máy; dòng đệm (số lần = 0) bị bỏ qua. Phản hồi tối đa 2 MB; có bộ nhớ đệm theo tiền tố 10 phút (tối đa 2000 tiền tố). **Timeout 2 giây / lỗi mạng / HTTP không 200 / phản hồi quá lớn → cho qua và ghi cảnh báo** (`pwned_check_unavailable` + lý do; không chứa mật khẩu, băm hay tiền tố băm) — không chặn đăng ký chỉ vì dịch vụ ngoài sập.
- **Danh sách cục bộ** (`packages/saas-core/src/auth/common-passwords.ts`, 2 087 mục): chạy được khi mất mạng và vẫn chặn khi HIBP lỗi.
  - **Nguồn:** SecLists `Passwords/Common-Credentials/10k-most-common.txt` (https://github.com/danielmiessler/SecLists), commit `913b327317` của file này.
  - **Giấy phép:** **MIT**, Copyright (c) 2018 Daniel Miessler — đã đối chiếu `LICENSE` trong kho gốc (và GitHub báo SPDX `MIT`); nguyên văn ở `docs/third-party/SecLists-LICENSE.txt` (MIT yêu cầu giữ thông báo bản quyền và nội dung giấy phép).
  - **Chọn lọc:** chữ thường, giữ mục dài ≥ 8 ký tự, bỏ trùng.
  - **Giới hạn cần biết:** file gốc có 10 001 dòng nhưng chỉ **51 mục dài ≥ 10 ký tự** (độ dài tối thiểu hiện tại), nên với chính sách hiện nay danh sách cục bộ chỉ là lưới an toàn nhỏ khi mất mạng; **bảo vệ chính là HIBP**. Muốn lưới cục bộ mạnh hơn cần danh sách lớn hơn và một quyết định giấy phép riêng.
- Đối chiếu thực tế (03/11): HIBP trả `HTTP 200` trong ~0,5 giây, phản hồi ~2 100 dòng CRLF trong đó ~190 dòng đệm `:0` (khớp định dạng mã dựa vào).
- `PWNED_CHECK=off` chỉ được ở `APP_ENV` dev/test/ci (dev không ra internet); luôn còn danh sách cục bộ.
- **Rủi ro còn lại đã chấp nhận:** `resetPassword` gọi HIBP trước khi kiểm token nên kẻ xấu có thể kích hoạt nhiều lần gọi HIBP bằng token giả với mật khẩu ngẫu nhiên (token rỗng/quá dài bị loại trước); bộ nhớ đệm không giúp vì tiền tố ngẫu nhiên. Giảm nhẹ: timeout 2 giây, host cố định, cho qua khi lỗi; sẽ xem lại cùng xô giới hạn cho đặt lại mật khẩu nếu cần.

## 4. 2FA (mốc M3)

- Plugin `twoFactor` của Better Auth 1.7, `storeBackupCodes: "encrypted"` (ADR 003), **10 mã dự phòng** (theo `13` §2; Stitch vẽ 8 — bỏ), TOTP 6 số / 30 giây, issuer "CommentFlow AI". Bảng `core.two_factors` (migration 0013): chỉ `cf_auth` trong `app.ctx='auth'`, `cf_app` không có quyền nào; `secret` và `backup_codes` được plugin mã hóa trước khi lưu (đã kiểm: không chứa mã thô). Cột `core.users.totp_enabled` giữ tên SQL, thuộc tính Drizzle/Better Auth là `twoFactorEnabled`.
- **Đăng nhập hai bước:** đúng mật khẩu mà đã bật 2FA → CHƯA có phiên (đã kiểm: không dòng `sessions`, `getSession` = null); web đặt cookie chờ của plugin + **cookie ký của ta** (`cf-2fa-pending`, HMAC bằng `BETTER_AUTH_SECRET`, 10 phút, chứa email người vừa qua bước mật khẩu) rồi chuyển sang `/login/2fa`. Chỉ khi mã TOTP/mã dự phòng đúng mới cấp phiên.
- **Rate limit nhập mã:** 5 lần / 15 phút theo email lấy từ cookie ký (không từ dữ liệu client — client không giả được để né giới hạn; đổi IP không giúp), cộng khóa tạm riêng theo người dùng của plugin. Ở trang bảo mật, mọi thao tác đòi mật khẩu (bật, tắt, tạo lại mã) dùng xô `reauth` 5 lần / 15 phút theo `userId` (phiên bị đánh cắp không dò được mật khẩu).
- **Cookie chờ gắn với cookie plugin (sửa sau kiểm chứng):** payload ký có thêm băm SHA-256 của cookie `two_factor`; `verifyLogin` chỉ chấp nhận khi hai cookie khớp. Nếu không, kẻ biết mật khẩu nạn nhân có thể ghép cookie plugin của nạn nhân với cookie chờ của nhiều tài khoản tự tạo để lấy thêm lượt thử. Có test ghép chéo.
- **Plugin xoay phiên khi bật/tắt 2FA** (xóa phiên cũ, cấp cookie mới): `confirmEnrollment` và `disable` trả cookie mới và Server Action đặt lại — nếu không người dùng bị đăng xuất ngay sau khi bật (test bắt được). Mọi Server Action gọi saas-core dùng `server/request-context.ts` (xóa header IP của client, đặt lại bằng IP tin cậy); Better Auth được ghim `ipAddressHeaders: ['x-forwarded-for']`.
- **Quyền cột:** `cf_auth` chỉ UPDATE `secret, backup_codes, verified, failed_verification_count, locked_until` của `two_factors` (migration 0014); `check-rls` cấm UPDATE `user_id`. Lùi 0013 phải kèm `UPDATE core.users SET totp_enabled = false`.
- **Mã dự phòng** dùng đúng một lần, giữ dấu gạch ngang (`xxxxx-xxxxx`); tạo lại thì mã cũ mất hiệu lực. Tắt 2FA và tạo lại mã đòi mật khẩu. Đổi `BETTER_AUTH_SECRET` làm hỏng secret 2FA đã lưu (ADR 003).
- **Bắt buộc với Owner của workspace và quản trị nền tảng (`is_admin`)**; Staff tùy chọn. Cổng ở `app/app/(guarded)/layout.tsx` chuyển về `/app/security`; trạng thái đọc phía server từ phiên + vai trò thật (qua RLS, `listWorkspacesOfUser`). Owner/Admin không tắt được 2FA (`required`). Lưu ý: `members.role` hiện chỉ có `owner|staff`; "Admin" của spec = `users.is_admin`.
- QR sinh trên server (`qrcode` 1.5.4, MIT), không dịch vụ ngoài; khóa nhập tay hiện kèm QR.
- `/app/security` (tạm, giao diện Cài đặt đầy đủ làm sau) hiện **phiên thật của chính người dùng**: trình duyệt/hệ điều hành suy từ `user_agent` bằng bộ nhận dạng tự viết (`ua-parser-js` 2.x là AGPL nên không dùng), lần dùng cuối, đánh dấu phiên hiện tại, đăng xuất từng phiên khác (kiểm phiên thuộc về người dùng — không đăng xuất được phiên của người khác, cũng không qua đường này đăng xuất phiên hiện tại); **không hiện IP/vị trí**.
- Nội dung bịa trong Stitch (cảnh báo Meta Tech Partner, "tạm ngưng sau 24 giờ", "8 mã") đã bỏ; trang dùng chuỗi thật vi/en.

## 5. Phụ thuộc mới

`ioredis` (MIT) cho Valkey; `qrcode` (MIT) cho mã QR. Valkey được thêm vào CI (service container) cho test tích hợp rate limit.

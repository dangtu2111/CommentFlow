# 003 — Xác thực bằng Better Auth: các điểm lệch so với thiết kế ban đầu (03/11/2026)

Trạng thái: **Đã chốt** (phương án A của bước C0). Bổ sung cho `001-stack.md` (chọn Better Auth). Spec đã được chủ dự án cho phép sửa đúng các chỗ liên quan: `docs/10` §1 và §3.1, `docs/13` §2, `docs/09` §3.1 (bản `10` v1.2, `13` v0.7).

## Bằng chứng (đọc mã nguồn `better-auth@1.7.15`, chỉ đọc, không chạy)

| Điểm | Phát hiện | Vị trí |
|---|---|---|
| Token phiên | Sinh bằng `generateId(32)`, lưu **thô** ở `session.token`, tra cứu `WHERE token = …`; không có tuỳ chọn băm token phiên | `dist/db/internal-adapter.mjs:285, 355–362` |
| Cookie phiên | Token + chữ ký HMAC bằng `BETTER_AUTH_SECRET`; chữ ký được kiểm trước khi tra DB | `dist/cookies/index.mjs:174` |
| Mật khẩu | Bảng `account` (`providerId: "credential"`, cột `password`); email được hạ chữ thường | `dist/api/routes/sign-up.mjs:158, 237–239` |
| 2FA — secret TOTP | Được mã hoá khi lưu (`symmetricEncrypt`), thuật toán **XChaCha20-Poly1305** (`@noble/ciphers`), khóa dẫn xuất từ `BETTER_AUTH_SECRET` | `dist/plugins/two-factor/index.mjs:136–150`, `dist/crypto/index.mjs:7,33` |
| 2FA — mã dự phòng | `storeBackupCodes`: `"plain"` \| `"encrypted"` \| `{ encrypt, decrypt }`. Plugin cần **giải mã được** danh sách để so khớp và xoá mã đã dùng → **không băm một chiều được** | `dist/plugins/two-factor/backup-codes/index.mjs:19–53` |
| Impersonation (plugin admin) | Tạo phiên thật của người dùng đích, mặc định 1 giờ, không read-only | `dist/plugins/admin/routes.mjs:598` |

## Quyết định

1. **Token phiên lưu thô trong DB** (`core.sessions.token`). Bù bằng: cookie ký HMAC (`BETTER_AUTH_SECRET` chỉ ở env/secret manager, không trong DB, kiểm chữ ký trước khi tra DB), **tắt `cookieCache`** (thu hồi phiên có hiệu lực ngay), phiên có hạn, xoá phiên khi đăng xuất/đổi mật khẩu/đổi quyền, không bao giờ log token. Lộ riêng DB không dựng được cookie hợp lệ; chỉ lộ cả DB lẫn khóa ký mới đủ chiếm phiên.
2. **Bảng mới trong schema `core`:** `accounts` (mật khẩu, OAuth), `verifications` (mã xác minh email/quên mật khẩu), `two_factors` (secret mã hoá + mã dự phòng). `users` bỏ `password_hash`/`totp_secret_enc`; thêm `email_verified`, `image`; `totp_enabled` giữ làm cờ.
3. **Mã dự phòng 2FA: `storeBackupCodes: "encrypted"`** (không thể băm vì plugin cần giải mã). Hệ quả: mã hoá bằng XChaCha20-Poly1305 của Better Auth, **không phải AES-GCM + `key_version`** như `13` §5 — chấp nhận; xoay khóa gắn với `BETTER_AUTH_SECRET`. Ghi vào gap matrix nếu muốn đồng nhất sau.
4. **Không dùng impersonation của plugin admin.** "Xem như khách" tự viết theo `13` §3.2 (chỉ đọc, 30 phút, bảng `admin_impersonations`).
5. **2FA bắt buộc Owner/Admin do app tự ép** (middleware: chưa bật 2FA thì chỉ vào được trang cài 2FA) — Better Auth không có cơ chế theo vai trò.

## Cấu hình sẽ áp dụng khi viết auth (nhóm C, bước C5)

| Hạng mục | Giá trị |
|---|---|
| Phạm vi lần này (quyết định #11) | Đăng ký, đăng nhập, quản lý phiên (email + mật khẩu). 2FA và rate limit: **chừa chỗ + ghi gap matrix**, chưa làm |
| Băm mật khẩu | **argon2id** bằng hàm `password.hash`/`password.verify` tuỳ chỉnh (mặc định Better Auth là scrypt); mật khẩu **≥ 10 ký tự** (`minPasswordLength`) |
| Hạn phiên | 14 ngày (app); **8 giờ cho `is_admin_session`** (đặt bằng `databaseHooks.session.create.before`) |
| `session.updateAge` | 1 giờ (→ `last_seen_at` = `updated_at`, ghi tối đa 1 lần/giờ) |
| `session.cookieCache` | **tắt** |
| Đổi mật khẩu | Xoá mọi phiên (`revokeOtherSessions` + xoá phiên hiện tại và tạo mới) |
| Xoay phiên | Khi đăng nhập và khi đổi quyền |
| Rate limit đăng nhập | 5 lần/15 phút theo IP **và** email, lưu ở Valkey, khóa tiền tố `sys:` (ngoại lệ đã ghi ở `001-stack.md` §6). Nếu rate limiter có sẵn của Better Auth không khoá theo email được thì **tự làm lớp này** |
| ID | `advanced.database.generateId: false` (DB sinh `uuid` bằng `gen_random_uuid()`) |
| Ánh xạ | `modelName`/`fields` → `core.users`, `core.sessions`, `core.accounts`, `core.verifications` (snake_case); `additionalFields`: `locale`, `is_admin_session` (`input: false`) |
| Drizzle | Truyền đối tượng schema `pgSchema('core')` cho `drizzleAdapter` (không dựa vào `search_path`); **xác nhận bằng test thật trên `cf_test`** |
| 2FA (nhánh sau) | Plugin `twoFactor`, `storeBackupCodes: "encrypted"`; middleware ép Owner/Admin |
| Khóa | `BETTER_AUTH_SECRET` chỉ ở env/secret manager; sao lưu DB và DB staging/dev **không** lưu cùng chỗ với khóa này |

## Rủi ro còn lại

- Lộ đồng thời DB và `BETTER_AUTH_SECRET` → chiếm được mọi phiên chưa hết hạn. Giảm bằng: khóa ngoài DB, phiên Admin 8 giờ, xoay khóa khi nghi ngờ (làm mọi phiên mất hiệu lực).
- Better Auth có thể đổi hành vi giữa các bản: ghim đúng `1.7.15`, đọc changelog trước khi nâng.
- Điểm chưa chạy thật: ánh xạ schema `core` qua Drizzle adapter, hook tạo phiên Admin 8 giờ → test ở C5.

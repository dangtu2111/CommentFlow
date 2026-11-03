# Bàn giao — nhánh `feat/auth-security`

Cập nhật: 2026-11-03 · Mục gap matrix: AUTH-RATELIMIT, AUTH-PWNED, AUTH-2FA · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-auth-security.md` (đã duyệt 03/11) · ADR: `docs/decisions/004-bao-ve-tai-khoan.md`

## Đã làm
- **M1 (rate limit) xong:** `packages/saas-core/src/ratelimit/` (khóa băm, kho Valkey + bộ nhớ, bộ giới hạn, chính sách theo ADR 004 §1); `createAuthFlows` nhận `limiter` bắt buộc; đăng nhập trả `rate_limited` + số phút; đăng ký/quên/gửi lại bị chặn trả kết quả trung tính và không gửi thư; web: `REDIS_URL`, `REDIS_KEY_PREFIX`, `CLIENT_IP_SOURCE` (none | cf-connecting-ip chỉ staging), header IP của client bị xóa trước khi gửi cho Better Auth; CI có Valkey; kiểm thật 9/9 (script e2e ở scratchpad, không commit).

## Đã đọc và rút ra
| File / nguồn | Điều cần nhớ |
|---|---|
| Next 16.4.4 `next dev` (đã thử) | Tự đặt `x-forwarded-for` = IP socket nhưng GIỮ giá trị client tự đặt; không có `request.ip`, không `x-real-ip` → dev không có IP đáng tin (ADR 004 §2) |
| ioredis 6.0.0 | `keyPrefix` áp dụng cả cho KEYS của `eval`; `redis.keys()` trả tên ĐẦY ĐỦ (có tiền tố) khi client không đặt `keyPrefix` — khi dọn khóa phải xóa đúng tên đầy đủ |
| next-intl | HTML của mọi trang chứa TOÀN BỘ chuỗi dịch trong payload → test HTTP không được dò câu chữ thông báo bằng `includes` trên chuỗi cố định; dò câu đã render (ví dụ có số) |
| Thư mục `_x` trong `app/` | Next coi là private (không tạo route) |

## Quyết định đã chốt trong phiên
- Không dựng server tùy biến lấy IP; dev chỉ xô theo email; staging/production `CF-Connecting-IP`; không khóa chung "unknown"; Valkey sập: log cảnh báo (không PII).

## Còn lại (theo thứ tự)
1. **M2 mật khẩu lộ:** HIBP k-anonymity (5 ký tự SHA-1, `Add-Padding: true`, timeout 2s → cho qua + log) + danh sách cục bộ (**ghi nguồn + giấy phép vào ADR 004 §3**, đối chiếu giấy phép gốc khi lấy về); áp dụng khi đăng ký và đặt lại mật khẩu.
2. **M3 2FA:** migration `0013_two_factors.sql`, plugin `twoFactor` (10 mã, `storeBackupCodes: 'encrypted'`), trang `/login/2fa`, `/app/security` (QR `qrcode`, wizard 3 bước, tắt 2FA/tạo lại mã đòi mật khẩu, danh sách phiên thật của người dùng + đăng xuất từng phiên; không IP/vị trí), xô 2FA 5/15 phút/người dùng, ép Owner/Admin (dữ liệu gieo chỉ `cf_test`).
3. Cuối nhánh: `verifier-security` + `verifier-db` MỘT lần trên diff nhánh + các sửa sau verifier của `feat/auth-ui` (trọng tâm: client không giả IP vượt rate limit); cập nhật gap matrix/codemap; xóa plan + handoff khi xong.

## Lệnh test liên quan
```
pnpm --filter @flow/saas-core exec vitest run src/ratelimit src/auth
pnpm --filter @flow/saas-core test:db      # cần REDIS_URL (Valkey thật)
pnpm --filter @flow/web test && pnpm lint:i18n
```

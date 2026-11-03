# Bàn giao — nhánh `feat/auth-security`

Cập nhật: 2026-11-03 · Mục gap matrix: AUTH-RATELIMIT, AUTH-PWNED, AUTH-2FA · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-auth-security.md` (đã duyệt 03/11) · ADR: `docs/decisions/004-bao-ve-tai-khoan.md`

## Đã làm
- **M1 (rate limit) xong:** `packages/saas-core/src/ratelimit/` (khóa băm, kho Valkey + bộ nhớ, bộ giới hạn, chính sách theo ADR 004 §1); `createAuthFlows` nhận `limiter` bắt buộc; đăng nhập trả `rate_limited` + số phút; đăng ký/quên/gửi lại bị chặn trả kết quả trung tính và không gửi thư; web: `REDIS_URL`, `REDIS_KEY_PREFIX`, `CLIENT_IP_SOURCE` (none | cf-connecting-ip chỉ staging), header IP của client bị xóa trước khi gửi cho Better Auth; CI có Valkey; kiểm thật 9/9 (script e2e ở scratchpad, không commit).

- **M2 (mật khẩu lộ) xong:** `password-policy.ts` (danh sách cục bộ SecLists 10k MIT + HIBP k-anonymity, timeout 2s cho qua + log, bộ nhớ đệm theo tiền tố), `createAuthFlows` nhận `passwordPolicy` bắt buộc (đăng ký sau cổng rate limit; đặt lại kiểm trước khi dùng token), thông báo vi/en, `PWNED_CHECK` (off chỉ dev/test/ci), ADR 004 §3 có nguồn + giấy phép, `docs/third-party/SecLists-LICENSE.txt`.

- **M3 (2FA + trang bảo mật) xong:** migration `0013_two_factors.sql` (bảng chỉ `cf_auth`), plugin `twoFactor`, `saas-core/src/auth/two-factor.ts` (bật/xác nhận/tắt/tạo lại mã, nhập mã khi đăng nhập, `overview`/`posture`/`revokeSession`, `requiresTwoFactor`), `pending.ts` (cookie ký chờ 2FA), `ua.ts` (nhận dạng trình duyệt tự viết), xô `twofa` và `reauth` ở limiter; web: `/login/2fa`, `/app/security`, cổng `app/app/(guarded)/layout.tsx`, `DATABASE_URL` (cf_app) thành bắt buộc cho web, chuỗi vi/en; test tích hợp `two-factor.int.test.ts` (15 ca, gồm Owner/`is_admin` bắt buộc, IDOR phiên, rate limit) + test RLS `two_factors`.

## Đã đọc và rút ra
| File / nguồn | Điều cần nhớ |
|---|---|
| Next 16.4.4 `next dev` (đã thử) | Tự đặt `x-forwarded-for` = IP socket nhưng GIỮ giá trị client tự đặt; không có `request.ip`, không `x-real-ip` → dev không có IP đáng tin (ADR 004 §2) |
| ioredis 6.0.0 | `keyPrefix` áp dụng cả cho KEYS của `eval`; `redis.keys()` trả tên ĐẦY ĐỦ (có tiền tố) khi client không đặt `keyPrefix` — khi dọn khóa phải xóa đúng tên đầy đủ |
| next-intl | HTML của mọi trang chứa TOÀN BỘ chuỗi dịch trong payload → test HTTP không được dò câu chữ thông báo bằng `includes` trên chuỗi cố định; dò câu đã render (ví dụ có số) |
| Thư mục `_x` trong `app/` | Next coi là private (không tạo route) |
| Better Auth 1.7.15 `twoFactor` | `enableTwoFactor` tạo secret + 10 mã nhưng `verified=false`/`totp_enabled=false` cho đến khi `verifyTOTP` đúng; đúng mật khẩu khi đã bật 2FA trả `twoFactorRedirect`, KHÔNG tạo phiên, đặt cookie `better-auth.two_factor` (10 phút); `verifyBackupCode` giữ dấu gạch của mã; plugin tự có rate limit 3 lần/10 giây ở `/two-factor/*` và khóa tạm theo người dùng; bảng cần thêm cột `verified`, `failed_verification_count`, `locked_until` |
| `apps/web` build | Không import `@flow/db` gốc (kéo `../migrations`, Turbopack lỗi) — dùng `@flow/db/runtime`; Server Action `'use server'` chỉ export hàm async |
| `.env` | Agent KHÔNG được đọc (kể cả đếm dòng). Khi chạy thử web thủ công thiếu `SMTP_FROM`/`BETTER_AUTH_URL` → truyền qua biến môi trường ở dòng lệnh |

## Quyết định đã chốt trong phiên
- Không dựng server tùy biến lấy IP; dev chỉ xô theo email; staging/production `CF-Connecting-IP`; không khóa chung "unknown"; Valkey sập: log cảnh báo (không PII).

## Còn lại (theo thứ tự)
1. Kiểm chứng độc lập ĐÃ CHẠY một lần (verifier-security + verifier-db): không có mục "Chặn merge"; đã sửa các mục "Nên sửa" (cookie chờ gắn cookie plugin, xoay phiên khi bật/tắt 2FA, header IP ở Server Action trang bảo mật, quyền UPDATE theo cột — migration 0014, ghim ipAddressHeaders, validate uuid/độ dài); phần còn lại ghi ở gap matrix `AUTH-HARDEN-4`. Việc kế: xóa plan + handoff khi `/finish`, mở PR khi chủ dự án đồng ý.
2. Việc ngoài nhánh (đã ghi gap matrix): giao diện Cài đặt đầy đủ, đổi mật khẩu/ngôn ngữ trong Cài đặt, quy trình khôi phục mất 2FA, Dockerfile web staging + cloudflared.
3. Chưa chạy trình duyệt thật cho UI 2FA (chỉ kiểm: luồng ở test tích hợp + build + chuyển hướng khi chưa đăng nhập). Chủ dự án thử tay: đăng ký → /app/security → bật 2FA → đăng xuất → đăng nhập.

## Lệnh test liên quan
```
pnpm --filter @flow/saas-core exec vitest run src/ratelimit src/auth
pnpm --filter @flow/saas-core test:db      # cần REDIS_URL (Valkey thật)
pnpm --filter @flow/web test && pnpm lint:i18n
```

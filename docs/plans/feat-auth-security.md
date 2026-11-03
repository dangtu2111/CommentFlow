# Kế hoạch `feat/auth-security` — rate limit + kiểm mật khẩu lộ + 2FA + phiên của tôi

## Việc

Mã gap matrix: `AUTH-RATELIMIT`, `AUTH-PWNED`, `AUTH-2FA` (và đóng một phần `HARDEN-3` g, l). Spec: `13` §2 (xác thực), §3.1 (ép 2FA Owner/Admin), `10` §3.1 (`two_factors`), ADR 003, `05` FR-001. Màn Stitch đã xem: `settings-2fa-setup-modal.png`, `settings-security.png` (chỉ hai trang này).

**Tóm tắt:** nhánh này thêm các lớp bảo vệ tài khoản: (1) **giới hạn số lần thử** (rate limit) cho đăng nhập, đăng ký, quên mật khẩu, gửi lại thư và nhập mã 2FA, đếm trên Valkey; (2) **từ chối mật khẩu đã lộ** (Have I Been Pwned, chỉ gửi 5 ký tự đầu SHA-1, kèm danh sách cục bộ); (3) **xác thực 2 bước TOTP** (mã 6 số) với 10 mã dự phòng, bắt buộc với Owner/Admin; (4) trang **`/app/security`** (tạm) có thẻ 2FA và danh sách **phiên đăng nhập thật của chính người dùng** (đăng xuất từng phiên). Vì sao: bạn đã chốt "không SMTP thật trên staging/production trước khi có rate limit" và "mật khẩu lộ phải xong trước cổng 0". Rủi ro chính: tin sai địa chỉ IP làm rate limit bị vượt — nên nguồn IP chỉ có hai kiểu (xem Quyết định) và là **trọng tâm kiểm chứng**.

**Phạm vi verifier (chốt 03/11):** diff nhánh này **cộng** các sửa sau verifier của `feat/auth-ui` chưa được kiểm lần hai: guard `callbackURL` cố định, đệm thời gian phản hồi, log Better Auth che email, nguồn IP (`lib/client-ip.ts`), CSP + Permissions-Policy, `check-rls` (7 cột `users`, policy chặn tạo Admin). Trọng tâm: **client không giả IP để vượt rate limit** (kể cả IP ghi vào `sessions.ip` và khóa Valkey).

## Điểm chưa rõ

Không có — mọi thẻ đã được chủ dự án trả lời (03/11). Các quyết định:

1. **Một nhánh, ba mốc, mỗi mốc một commit** (M1 rate limit → M2 mật khẩu lộ → M3 2FA + trang bảo mật); kiểm chứng MỘT lần ở cuối nhánh (gồm các sửa sau verifier của `feat/auth-ui`).
2. **Thư viện:** `ioredis` (MIT) cho Valkey; `qrcode` (MIT) sinh QR **trên server** (không dịch vụ ngoài); service **Valkey trong CI**.
3. **Ngưỡng:** đăng nhập 5 lần/15 phút/(IP+email) theo spec; thêm **xô riêng theo email** ngưỡng **cao hơn** xô IP (đăng nhập 10 lần/15 phút/email), **chỉ khóa tạm** (tự hết, không khóa tài khoản vĩnh viễn) và **phản hồi giống hệt** dù email có tồn tại hay không (chống kẻ xấu khóa tài khoản người khác để dò). Quên mật khẩu 3 lần/giờ; đăng ký 5 lần/giờ/IP và 3 lần/giờ/email; gửi lại thư 3 lần/giờ/email; mã 2FA 5 lần/15 phút/người dùng.
4. **Khi bị chặn:** đăng nhập và nhập mã 2FA báo "thử quá nhiều lần, đợi N phút" (không nhắc email); đăng ký, quên mật khẩu, gửi lại thư trả **cùng thông báo trung tính** như bình thường và **không gửi thư**.
5. **Valkey sập:** đăng nhập/2FA dùng bộ đếm trong bộ nhớ tiến trình; đăng ký/quên mật khẩu/gửi lại thư **không gửi thư**; **ghi log cảnh báo** (không có PII).
6. **Nguồn IP:** *Dev/LAN:* IP của kết nối trực tiếp, **không tin bất kỳ header nào** (bỏ hẳn `X-Forwarded-For` và `TRUSTED_PROXY_HOPS` đã làm ở `feat/auth-ui`). *Staging:* tin `CF-Connecting-IP`, **chỉ khi `APP_ENV=staging`** (cấu hình ở môi trường khác bị từ chối khi khởi động); điều kiện hạ tầng: cổng web **không publish**, chỉ `cloudflared` cùng mạng Docker truy cập được web. Nếu không lấy được IP: bỏ xô IP, chỉ dùng xô email (không gom mọi người vào một khóa "unknown").
7. **Mật khẩu lộ:** duyệt gọi **HIBP k-anonymity** (`api.pwnedpasswords.com/range/<5 ký tự SHA-1>`, `Add-Padding: true`, timeout 2 giây → **cho qua + log cảnh báo**); thêm **danh sách cục bộ** các mật khẩu phổ biến (chạy được khi mất mạng); **ghi nguồn + giấy phép vào ADR 004** (ứng viên: SecLists `10k-most-common.txt` — kiểm lại giấy phép gốc khi lấy về, không giả định); áp dụng khi đăng ký và đặt lại mật khẩu, không áp dụng khi đăng nhập.
8. **Dữ liệu gieo** (Owner/Admin giả để thử ép 2FA) chỉ trong `cf_test`.
9. **Khác:** **10 mã dự phòng** (theo `13` §2; ghi khác biệt với Stitch "8 mã"); **bỏ mọi nội dung bịa** của Stitch ("Meta Tech Partner Tier 1", "ISO 27001", "Điểm bảo mật 100/100", thiết bị mẫu, banner kiểu chứng nhận); **danh sách thiết bị = phiên thật của chính người dùng** (trình duyệt/hệ điều hành, lần dùng cuối, đăng xuất phiên đó; không hiện IP/vị trí vì không bịa "Hà Nội" và giảm PII); giao diện tạm ở `/app/security`; ép 2FA cho Owner/Admin bằng hàm kiểm + chuyển hướng về `/app/security?required=1`.

## Tiêu chí nghiệm thu

1. Đăng nhập sai quá ngưỡng (IP+email) → `rate_limited` kèm thời gian chờ; đúng mật khẩu trong lúc đang bị chặn vẫn bị từ chối — kiểm bằng: test tích hợp Valkey thật.
2. **Đổi IP không vượt được:** 11 lần đăng nhập sai cho một email từ 11 IP khác nhau vẫn bị chặn bởi xô theo email — kiểm bằng: test.
3. **Xô email không lộ email có tồn tại:** nội dung, mã HTTP, chuyển hướng và thời gian phản hồi của trạng thái bị chặn giống nhau cho email có thật và email lạ — kiểm bằng: test so sánh hai trường hợp.
4. **Nguồn IP:** khi cấu hình socket, mọi header (`X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP`) do client gửi đều bị bỏ qua; `CF-Connecting-IP` chỉ có tác dụng khi `APP_ENV=staging` và cấu hình như vậy ở môi trường khác làm khởi động báo lỗi; IPv6 cùng /64, hoa/thường, dạng `::ffff:1.2.3.4` quy về cùng một khóa; không lấy được IP thì không dùng xô IP — kiểm bằng: test đơn vị + test qua Server Action. **Điều kiện kỹ thuật cần xác minh ở đầu M1:** Next có cung cấp IP kết nối trực tiếp cho Server Action hay không; nếu không, phương án thay thế (máy chủ tùy biến/tầng đệm cục bộ) phải nêu cho chủ dự án trước khi làm tiếp.
5. Đăng ký, quên mật khẩu, gửi lại thư bị chặn vẫn trả đúng cùng thông báo như bình thường và **không gửi thư**; khóa Valkey chứa **băm** email/IP (không thô), có tiền tố `sys:` và TTL — kiểm bằng: test (so phản hồi, đếm thư, quét khóa).
6. Valkey không dùng được: đăng nhập vẫn hoạt động (giới hạn trong bộ nhớ) và có log cảnh báo; đăng ký/quên mật khẩu/gửi lại thư không gửi thư — kiểm bằng: test với kết nối hỏng.
7. Mật khẩu có trong danh sách cục bộ hoặc HIBP bị từ chối khi đăng ký/đặt lại; HIBP timeout/lỗi → cho qua + log (danh sách cục bộ vẫn chặn); chỉ 5 ký tự SHA-1 và `Add-Padding: true` rời máy — kiểm bằng: test với `fetch` giả kiểm yêu cầu gửi đi.
8. Bật 2FA: quét QR (sinh trên server), nhập mã đúng mới bật, mã sai bị từ chối; `users.totp_enabled` = true; `two_factors.secret` và mã dự phòng **không thô** trong DB — kiểm bằng: test tích hợp (đọc bằng role chủ sở hữu).
9. Có **đúng 10** mã dự phòng; dùng được mỗi mã một lần — kiểm bằng: test.
10. Đăng nhập khi đã bật 2FA: đúng mật khẩu **chưa** cấp phiên; mã TOTP đúng hoặc mã dự phòng mới có phiên; mã sai nhiều lần bị rate limit — kiểm bằng: test tích hợp.
11. Tắt 2FA và tạo lại mã dự phòng đòi mật khẩu; tạo lại làm mã cũ mất hiệu lực — kiểm bằng: test.
12. Owner/Admin chưa bật 2FA bị chuyển về `/app/security?required=1` ở mọi trang `/app` khác; Staff không bị ép — kiểm bằng: test với dữ liệu gieo **trong `cf_test`**.
13. **Phiên của tôi:** `/app/security` liệt kê đúng các phiên của chính người dùng (trình duyệt/hệ điều hành, lần dùng cuối, đánh dấu phiên hiện tại, không hiện IP); đăng xuất một phiên khác làm phiên đó mất hiệu lực ngay; **không đăng xuất được phiên của người khác** (đoán `sessionId`) — kiểm bằng: test tích hợp (gồm ca IDOR) + e2e.
14. `cf_app` không có quyền nào trên `two_factors`; `cf_auth` chỉ qua `app.ctx = 'auth'`; `check-rls` đạt và đỏ nếu thiếu policy — kiểm bằng: test tích hợp + `pnpm db:check-rls`.
15. Giao diện vi/en; không còn nội dung bịa của Stitch; lint i18n đạt — kiểm bằng: `pnpm lint:i18n`, script e2e, bạn xem tay.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `packages/saas-core/src/auth/{auth.ts,flows.ts,revoke.ts}` — gắn plugin 2FA, `loginGate`, mật khẩu lộ, hủy từng phiên (đã đọc).
2. `apps/web/src/app/(auth)/actions.ts`, `lib/client-ip.ts`, `server/{env,auth}.ts` — chỗ gắn cổng và nguồn IP (đã đọc).
3. `packages/db/src/check-rls.ts`, migration 0010–0012 — mẫu cho `two_factors` (đã đọc).
4. Tài liệu plugin `twoFactor` của Better Auth 1.7.15 — kiểu và hành vi (`enable`, `verifyTotp`, `verifyBackupCode`, `generateBackupCodes`, `disable`).
5. `design/stitch/settings-2fa-disable-modal.png` — màn còn lại chưa xem.
6. Cách Next 16 cung cấp IP kết nối trực tiếp cho Server Action — kiểm ở đầu M1.

## File sẽ sửa / tạo

| File | Việc |
|---|---|
| `packages/saas-core/src/ratelimit/{limiter.ts,keys.ts,valkey.ts,memory.ts,index.ts}` | Bộ giới hạn: khóa băm tiền tố `sys:`, cửa sổ cố định (INCR + EXPIRE bằng script Lua), xô theo IP+email / email / IP, dự phòng trong bộ nhớ + log cảnh báo |
| `packages/saas-core/src/auth/{password-policy.ts,common-passwords.ts}` | Mật khẩu lộ: danh sách cục bộ + HIBP k-anonymity |
| `packages/saas-core/src/auth/{auth.ts,flows.ts,sessions.ts}` | Plugin `twoFactor` (10 mã, `storeBackupCodes: 'encrypted'`), `loginGate` thật, cổng cho đăng ký/quên/gửi lại, kiểm mật khẩu lộ, luồng 2FA, `listSessions`/`revokeSession` (chỉ của chính người dùng) |
| `packages/db/migrations/0013_two_factors.sql`, `src/schema/core/auth.ts` | `core.two_factors` + RLS (chỉ `cf_auth` trong `app.ctx='auth'`) |
| `apps/web/src/lib/client-ip.ts` (+ test) | Rút gọn: nguồn `socket` hoặc `cf-connecting-ip` (chỉ staging); bỏ `X-Forwarded-For`/`TRUSTED_PROXY_HOPS`; chuẩn hóa IP |
| `apps/web/src/server/{env,auth}.ts` | `REDIS_URL`, `CLIENT_IP_SOURCE`, tạo bộ giới hạn |
| `apps/web/src/app/(auth)/login/2fa/page.tsx`, `actions.ts`, `components/auth/*` | Trang nhập mã 2FA/mã dự phòng; thông báo bị chặn |
| `apps/web/src/app/app/security/page.tsx`, `components/security/*` | Thẻ 2FA (wizard 3 bước, tắt 2FA, tạo lại mã), danh sách phiên của tôi |
| Guard trong `getCurrentUser`/`app/app/layout.tsx` | Ép 2FA cho Owner/Admin |
| `packages/shared/src/i18n/messages/{vi,en}.json` | Chuỗi mới (cả hai ngôn ngữ) |
| `.github/workflows/ci.yml` | Service `valkey` cho job Database |
| `docs/decisions/004-bao-ve-tai-khoan.md` | ADR: rate limit, nguồn IP, mật khẩu lộ (nguồn + giấy phép danh sách cục bộ), 2FA |
| `env.example`, `infra/scripts/print-dev-env.sh` | `REDIS_URL` (đã có), `CLIENT_IP_SOURCE` |
| `docs/gap-matrix.md`, `docs/codemap.md`, `design/stitch/README.md`, `docs/handoff/feat-auth-security.md` | Cập nhật; thêm dòng gap: Dockerfile + service `web` của `cf-staging` không publish cổng, chỉ `cloudflared` cùng mạng |

## Migration

`0013_two_factors.sql`: `core.two_factors` (`id` uuid PK, `user_id` FK → `users` ON DELETE CASCADE, `secret` text, `backup_codes` text), RLS bật, policy `FOR ALL TO cf_auth` đòi `in_auth_context()`; `cf_auth` GRANT SELECT/INSERT/UPDATE/DELETE; `cf_app` **không** quyền nào. Đường lùi: `DROP TABLE core.two_factors`.

## Test viết trước

Bộ giới hạn (cửa sổ, TTL, ba loại xô, khóa băm, đổi IP), nguồn IP (socket/CF/header giả/IPv6), phản hồi trung tính khi bị chặn, kiểm mật khẩu lộ (SHA-1 prefix, `Add-Padding`, timeout, danh sách cục bộ), các nhánh 2FA của `flows`, hủy phiên (gồm IDOR), quyền `two_factors` của `cf_app`/`cf_auth`, hàm ép 2FA Owner/Admin. Test tích hợp rate limit chạy trên Valkey thật (VM ở local, service container ở CI).

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/saas-core exec vitest run src/ratelimit src/auth
pnpm --filter @flow/saas-core test:db      # cần REDIS_URL (Valkey thật)
pnpm --filter @flow/web test && pnpm lint:i18n
pnpm --filter @flow/db test:db && pnpm db:check-rls
```

## Cần kiểm chứng độc lập không?

**Có** (auth, phiên, 2FA, nguồn IP, migration RLS): `verifier-security` + `verifier-db` **một lần** ở cuối nhánh, trên diff nhánh này cộng các sửa sau verifier của `feat/auth-ui`. Trọng tâm: nguồn IP đúng chỗ, client không giả IP để vượt rate limit; 2FA không bị lách; không hủy được phiên của người khác.

## Rủi ro / câu hỏi cho chủ dự án

- **Thứ tự:** nhánh này dựa trên `feat/auth-ui` chưa merge. **Chỉ bắt đầu code sau khi `feat/auth-ui` merge và nhánh này đã rebase lên `main`** (có thể xung đột `gap-matrix.md`/`codemap.md`).
- Next có thể không đưa IP kết nối trực tiếp cho Server Action (xem tiêu chí 4); sẽ kiểm ở đầu M1 và báo trước nếu cần máy chủ tùy biến.
- Đổi `BETTER_AUTH_SECRET` làm hỏng mọi secret 2FA đã lưu (ADR 003) — ghi cảnh báo vận hành.
- Nhiều người cùng một IP (NAT): xô email/IP+email giảm chặn oan, nhưng xô IP riêng có thể chặn chung; ngưỡng sẽ ghi ở ADR 004.
- Mất điện thoại và hết mã dự phòng: chưa có đường khôi phục (Admin hỗ trợ) — ghi gap matrix.

## Đề xuất thay đổi

- `13` §2: bổ sung ngưỡng cho đăng ký, gửi lại thư, nhập mã 2FA; xô theo email; nguồn IP (`CF-Connecting-IP` chỉ sau Cloudflare Tunnel).
- `design/stitch/README.md`: ghi khác biệt "8 mã dự phòng" (Stitch) vs 10 (spec) và các nội dung bịa đã bỏ.

## Complexity tracking

| Nguyên tắc `AGENTS.md` | Vì sao cần | Phương án đơn giản hơn đã loại |
|---|---|---|
| Thêm thư viện: nêu lý do + giấy phép | `ioredis` (MIT) nói chuyện với Valkey; `qrcode` (MIT) sinh QR trên server | Tự viết client RESP / bộ tạo QR: dễ sai, khó kiểm chứng |
| Không trừu tượng hóa sớm | `RateLimiter` có hai cài đặt (Valkey, bộ nhớ) | Chỉ Valkey: mất dự phòng khi Valkey sập (đã chốt) |
| Ngoại lệ nguyên tắc #2 | Khóa Valkey trước khi có workspace dùng tiền tố `sys:` (ADR 001) | Khóa theo workspace: chưa có workspace lúc đăng nhập |
| Gọi dịch vụ ngoài | HIBP (bạn đã duyệt 03/11) | Chỉ danh sách cục bộ: bắt ít mật khẩu lộ hơn |
| Không tự parse chuỗi phức tạp | Đọc `user_agent` để hiện trình duyệt/hệ điều hành: tự viết bộ nhận dạng nhỏ (Chrome/Edge/Firefox/Safari × Windows/macOS/Android/iOS/Linux) có test | `ua-parser-js` bản 2.x giấy phép AGPL — không dùng |

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11) với các quyết định ở mục "Điểm chưa rõ". **Chưa bắt đầu code:** chờ `feat/auth-ui` merge, rồi rebase nhánh này lên `main` và bắt đầu từ M1.

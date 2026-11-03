# Kế hoạch `feat/auth-security` — rate limit + kiểm mật khẩu lộ + 2FA

## Việc

Mã gap matrix: `AUTH-RATELIMIT`, `AUTH-PWNED`, `AUTH-2FA` (và đóng một phần `HARDEN-3` g, l). Spec: `13` §2 (xác thực), §3.1 (ép 2FA Owner/Admin), `10` §3.1 (`two_factors`), ADR 003, `05` FR-001. Màn Stitch đã xem: `settings-2fa-setup-modal.png`, `settings-security.png` (chỉ hai trang này).

**Tóm tắt (đọc phần này trước):** nhánh này thêm ba lớp bảo vệ tài khoản: (1) **giới hạn số lần thử** (rate limit) cho đăng nhập, đăng ký, quên mật khẩu, gửi lại thư và nhập mã 2FA, đếm trên Valkey; (2) **từ chối mật khẩu đã lộ** (kiểm bằng dịch vụ Have I Been Pwned, chỉ gửi 5 ký tự đầu của băm SHA-1, không gửi mật khẩu); (3) **xác thực 2 bước TOTP** (mã 6 số từ ứng dụng điện thoại) kèm mã dự phòng, bắt buộc với Owner/Admin. Vì sao: bạn đã chốt "không SMTP thật trên staging/production trước khi có rate limit" và "mật khẩu lộ phải xong trước cổng 0". Rủi ro chính: nếu máy chủ tin sai địa chỉ IP (X-Forwarded-For do client tự đặt) thì rate limit bị vượt dễ dàng — đây là **trọng tâm kiểm chứng** theo yêu cầu của bạn.

**Phạm vi verifier (đã chốt 03/11):** diff nhánh này **cộng** các sửa sau verifier của `feat/auth-ui` chưa được kiểm lần hai: guard `callbackURL` cố định, đệm thời gian phản hồi, log Better Auth che email, IP theo proxy tin cậy (`lib/client-ip.ts`, `TRUSTED_PROXY_HOPS`), CSP + Permissions-Policy, `check-rls` (7 cột `users`, policy chặn tạo Admin). Trọng tâm: **chỉ tin `X-Forwarded-For` từ proxy tin cậy; client không giả IP để vượt rate limit** (kể cả IP ghi vào `sessions.ip` và khóa Valkey).

## Điểm chưa rõ

> Mỗi thẻ có khuyến nghị; bạn trả lời xong tôi thay bằng quyết định rồi mới code.

- [CẦN LÀM RÕ: **một nhánh hay hai?** Bạn từng chốt "một nhánh" (rate limit + mật khẩu lộ + 2FA). Diff sẽ lớn, khó kiểm chứng. *Khuyến nghị:* giữ MỘT nhánh nhưng làm theo 3 mốc, mỗi mốc một commit (M1 rate limit → M2 mật khẩu lộ → M3 2FA) và chạy verifier MỘT lần ở cuối; nếu M3 phình to thì tách PR riêng.]
- [CẦN LÀM RÕ: **thư viện Valkey/Redis cho Node** (repo chưa có). *Khuyến nghị:* `ioredis` (MIT, phổ biến, chạy tốt với Valkey 8). Phương án: `iovalkey` (bản fork của ioredis cho Valkey, MIT) hoặc `redis` (node-redis, MIT).]
- [CẦN LÀM RÕ: **ngưỡng rate limit** — spec chỉ nêu đăng nhập 5 lần/15 phút/IP+email và quên mật khẩu 3 lần/giờ. *Khuyến nghị cho phần spec còn thiếu:* đăng ký 5 lần/giờ/IP và 3 lần/giờ/email; gửi lại thư xác minh 3 lần/giờ/email; nhập mã 2FA 5 lần/15 phút/người dùng. **Thêm một xô theo RIÊNG email** (đăng nhập: 10 lần/15 phút/email bất kể IP) để kẻ tấn công đổi IP liên tục vẫn bị chặn.]
- [CẦN LÀM RÕ: **khi bị chặn thì giao diện làm gì?** *Khuyến nghị:* đăng nhập và nhập mã 2FA hiện "Bạn đã thử quá nhiều lần, hãy đợi N phút"; còn đăng ký, quên mật khẩu, gửi lại thư vẫn trả **cùng thông báo trung tính** nhưng không gửi thư (không lộ "đang bị chặn" hay "email có thật").]
- [CẦN LÀM RÕ: **khi Valkey không dùng được.** *Khuyến nghị:* đăng nhập/2FA chuyển sang bộ đếm trong bộ nhớ của tiến trình (đỡ chặn cả hệ thống, vẫn có giới hạn); đăng ký/quên mật khẩu/gửi lại thư **chặn hẳn** (không gửi thư) vì chúng gửi email hàng loạt được.]
- [CẦN LÀM RÕ: **nguồn địa chỉ IP trên staging.** Staging đi qua Cloudflare Tunnel (ADR 002). *Khuyến nghị:* thêm biến `CLIENT_IP_HEADER` (`cf-connecting-ip` | `x-forwarded-for`); với tunnel dùng `cf-connecting-ip` (Cloudflare ghi đè, client không đặt được) — **chỉ đúng khi cổng web KHÔNG truy cập được trực tiếp ngoài tunnel** (việc của bạn/hạ tầng; tôi ghi vào `docs/` và kiểm lúc khởi động nếu có thể). Dev/không proxy: không tin header nào.]
- [CẦN LÀM RÕ: **kiểm mật khẩu lộ bằng gì.** Gọi dịch vụ ngoài `api.pwnedpasswords.com` (chỉ gửi 5 ký tự đầu SHA-1, kèm `Add-Padding`). *Khuyến nghị:* HIBP + **danh sách cục bộ ~10 nghìn mật khẩu phổ biến** (chạy được khi mất mạng); HIBP timeout 2 giây thì **cho qua** (không chặn đăng ký vì dịch vụ ngoài sập) nhưng danh sách cục bộ vẫn áp dụng; áp dụng khi đăng ký và đặt lại mật khẩu, **không** áp dụng khi đăng nhập; báo lỗi "Mật khẩu này đã xuất hiện trong các vụ lộ dữ liệu, hãy chọn mật khẩu khác". Bạn duyệt việc gọi ra ngoài này?]
- [CẦN LÀM RÕ: **số mã dự phòng 2FA:** Stitch vẽ 8 mã ("Còn 8/8"), `13` §2 ghi 10 mã. *Khuyến nghị:* 10 (theo spec, là mặc định của plugin); ghi khác biệt vào `design/stitch/README.md`.]
- [CẦN LÀM RÕ: **giao diện cài 2FA nằm ở đâu.** Thiết kế đặt trong Cài đặt → Tài khoản & Bảo mật, nhưng khung ứng dụng (thanh bên, cài đặt, workspace) chưa dựng. *Khuyến nghị:* dựng trang tối giản `/app/security` (chưa có thanh bên) gồm thẻ 2FA, wizard 3 bước (quét QR → nhập mã 6 số → lưu mã dự phòng), tắt 2FA (cần mật khẩu), tạo lại mã dự phòng; sau này chuyển vào Cài đặt. Phần "phiên đang hoạt động", "đổi mật khẩu", "ngôn ngữ" của màn Stitch **không** làm ở nhánh này (thêm dòng gap matrix).]
- [CẦN LÀM RÕ: **bỏ nội dung bịa trong màn Stitch** (như quyết định trước): "Đạt chuẩn Meta Tech Partner / Tier 1", "ISO 27001", "Điểm bảo mật 100/100", danh sách thiết bị mẫu ("iPhone 15 Pro"), banner "chính sách Meta" kiểu chứng nhận. *Khuyến nghị:* bỏ hết; giữ câu thật: Owner bắt buộc bật 2FA theo chính sách của sản phẩm.]
- [CẦN LÀM RÕ: **ép 2FA cho Owner/Admin ngay bây giờ?** Owner chỉ có sau khi tạo workspace và Admin chưa có màn hình — chưa có luồng thật để thử. *Khuyến nghị:* làm hàm kiểm + chuyển hướng về `/app/security?required=1` cho người là Admin hoặc Owner của ít nhất một workspace mà chưa bật 2FA, **test bằng dữ liệu gieo** (không có đường tạo Owner thật ở nhánh này).]
- [CẦN LÀM RÕ: **thư viện QR:** `qrcode` (MIT) để vẽ mã QR từ URI `otpauth://`. *Khuyến nghị:* đồng ý (tự viết bộ tạo QR là rủi ro sai). Không thêm thư viện TOTP vì plugin Better Auth đã có.]
- [CẦN LÀM RÕ: **CI cần dịch vụ Valkey** cho test tích hợp rate limit (thêm container `valkey/valkey` vào job Database). Đồng ý?]

## Tiêu chí nghiệm thu

1. Đăng nhập sai quá ngưỡng (IP+email) → `rate_limited` với thời gian chờ; đúng mật khẩu trong lúc bị chặn vẫn bị từ chối — kiểm bằng: test tích hợp Valkey thật.
2. **Đổi IP không vượt được:** gửi 11 lần đăng nhập sai cho một email từ 11 IP khác nhau vẫn bị chặn (xô riêng theo email) — kiểm bằng: test.
3. **Giả `X-Forwarded-For` không có tác dụng** khi không có proxy tin cậy / ngoài phần tử do proxy tin cậy ghi; `CF-Connecting-IP` giả bị bỏ qua khi cấu hình dùng `X-Forwarded-For` (và ngược lại); IPv6 cùng /64, hoa/thường và dạng `::ffff:1.2.3.4` quy về cùng một khóa — kiểm bằng: test đơn vị `client-ip` + test tích hợp qua Server Action.
4. Đăng ký, quên mật khẩu, gửi lại thư bị chặn vẫn trả **đúng cùng thông báo** như bình thường và **không gửi thư**; khóa Valkey chứa **băm** email/IP, không chứa email/IP thô, có tiền tố `sys:` và TTL — kiểm bằng: test (so nội dung phản hồi, đếm thư, quét khóa Valkey).
5. Valkey không dùng được: đăng nhập vẫn hoạt động với giới hạn trong bộ nhớ; đăng ký/quên mật khẩu/gửi lại thư không gửi thư — kiểm bằng: test với kết nối hỏng.
6. Mật khẩu có trong danh sách cục bộ hoặc HIBP bị từ chối khi đăng ký/đặt lại; HIBP timeout hoặc lỗi → cho qua (danh sách cục bộ vẫn chặn); chỉ 5 ký tự SHA-1 rời máy (kiểm yêu cầu gửi đi) — kiểm bằng: test với `fetch` giả.
7. Bật 2FA: quét QR, nhập mã đúng mới bật; mã sai bị từ chối; `users.totp_enabled` thành true; `two_factors.secret` và mã dự phòng **không ở dạng thô** trong DB — kiểm bằng: test tích hợp (đọc bằng role chủ sở hữu).
8. Đăng nhập khi đã bật 2FA: đúng mật khẩu **chưa** cấp phiên; nhập mã TOTP đúng hoặc một mã dự phòng (dùng được đúng một lần) mới có phiên; mã sai nhiều lần bị rate limit — kiểm bằng: test tích hợp.
9. Tắt 2FA và tạo lại mã dự phòng đòi mật khẩu; tạo lại mã làm mã cũ mất hiệu lực — kiểm bằng: test.
10. Owner/Admin chưa bật 2FA bị chuyển về `/app/security?required=1` ở mọi trang `/app` khác; Staff không bị ép — kiểm bằng: test với dữ liệu gieo.
11. `cf_app` không có quyền nào trên `two_factors`; `cf_auth` chỉ qua `app.ctx = 'auth'`; `check-rls` đạt và đỏ nếu thiếu policy — kiểm bằng: test tích hợp + `pnpm db:check-rls`.
12. Giao diện vi/en, không còn nội dung bịa của Stitch, mã 10 chứ không phải 8; lint i18n đạt — kiểm bằng: `pnpm lint:i18n`, e2e script, bạn xem tay.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `packages/saas-core/src/auth/{auth.ts,flows.ts}` — gắn plugin 2FA, `loginGate`, mật khẩu lộ (đã đọc ở nhánh trước).
2. `apps/web/src/app/(auth)/actions.ts`, `lib/client-ip.ts`, `server/{env,auth}.ts` — chỗ gắn cổng và IP (đã đọc).
3. `packages/db/src/check-rls.ts`, migration 0010–0012 — mẫu cho bảng `two_factors` (đã đọc).
4. Kiểu của plugin `twoFactor` trong Better Auth 1.7.15 (`enable`, `verifyTotp`, `verifyBackupCode`, `generateBackupCodes`, `viewBackupCodes`, `disable`) — tra tài liệu (không đọc được `node_modules`).
5. `design/stitch/settings-2fa-disable-modal.png` — còn lại một màn chưa xem.

## File sẽ sửa / tạo

| File | Việc |
|---|---|
| `packages/saas-core/src/ratelimit/{limiter.ts,keys.ts,valkey.ts,memory.ts,index.ts}` | Bộ giới hạn: khóa băm có tiền tố `sys:`, cửa sổ cố định bằng INCR+EXPIRE (script Lua một lệnh), dự phòng trong bộ nhớ |
| `packages/saas-core/src/auth/password-policy.ts` (+ `common-passwords.ts`) | Kiểm mật khẩu lộ: danh sách cục bộ + HIBP k-anonymity |
| `packages/saas-core/src/auth/{auth.ts,flows.ts}` | Plugin `twoFactor`, `loginGate` thật (Valkey), cổng cho đăng ký/quên/gửi lại, kiểm mật khẩu lộ, luồng 2FA (`verifyTotp`, `verifyBackupCode`) |
| `packages/db/migrations/0013_two_factors.sql`, `src/schema/core/auth.ts` | Bảng `two_factors` + RLS (chỉ `cf_auth` trong `app.ctx='auth'`); `check-rls` đã có `two_factors` ở nhóm chỉ-`cf_auth` |
| `apps/web/src/lib/client-ip.ts` | Thêm `CLIENT_IP_HEADER`, chuẩn hóa IP (IPv6 /64, `::ffff:`) |
| `apps/web/src/server/{env,auth}.ts` | `REDIS_URL`, `CLIENT_IP_HEADER`, tạo bộ giới hạn |
| `apps/web/src/app/(auth)/{login/2fa,…}` + `actions.ts` | Trang nhập mã 2FA/mã dự phòng; thông báo bị chặn |
| `apps/web/src/app/app/security/page.tsx`, `components/security/*` | Thẻ 2FA, wizard 3 bước, tắt 2FA, tạo lại mã dự phòng |
| `apps/web/src/app/app/layout.tsx` hoặc guard trong `getCurrentUser` | Ép 2FA cho Owner/Admin |
| `packages/shared/src/i18n/messages/{vi,en}.json` | Chuỗi mới (cả hai ngôn ngữ) |
| `.github/workflows/ci.yml` | Service `valkey` cho job Database |
| `env.example`, `infra/scripts/print-dev-env.sh` | `REDIS_URL` (đã có), `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS` |
| `docs/gap-matrix.md`, `docs/codemap.md`, `design/stitch/README.md`, `docs/handoff/feat-auth-security.md` | Cập nhật cuối nhánh |

## Migration

`0013_two_factors.sql`: `core.two_factors` (`id` uuid PK, `user_id` FK → `users` ON DELETE CASCADE, `secret` text, `backup_codes` text), RLS bật, policy `FOR ALL TO cf_auth` đòi `in_auth_context()`; `cf_auth` GRANT SELECT/INSERT/UPDATE/DELETE; `cf_app` **không** quyền nào. Đường lùi: `DROP TABLE core.two_factors`.

## Test viết trước

Bộ giới hạn (cửa sổ, TTL, xô theo email, khóa băm), chuẩn hóa IP và nguồn IP, kiểm mật khẩu lộ (SHA-1 prefix, timeout, danh sách cục bộ), các nhánh 2FA của `flows`, quyền `two_factors` của `cf_app`/`cf_auth`, hàm ép 2FA Owner/Admin. Test tích hợp rate limit chạy trên Valkey thật.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/saas-core exec vitest run src/ratelimit src/auth
pnpm --filter @flow/saas-core test:db      # cần REDIS_URL (Valkey thật)
pnpm --filter @flow/web test && pnpm lint:i18n
pnpm --filter @flow/db test:db && pnpm db:check-rls
```

## Cần kiểm chứng độc lập không?

**Có** (auth, phiên, 2FA, chữ ký/IP, migration RLS): `verifier-security` + `verifier-db` **một lần** ở cuối nhánh, trên diff nhánh này cộng các sửa sau verifier của `feat/auth-ui` (xem phạm vi ở phần Việc). Trọng tâm: tin `X-Forwarded-For`/`CF-Connecting-IP` đúng chỗ, không giả IP để vượt rate limit; 2FA không bị lách (đúng mật khẩu chưa có phiên; không đường nào cấp phiên bỏ qua 2FA).

## Rủi ro / câu hỏi cho chủ dự án

- Nhánh này **dựa trên `feat/auth-ui` chưa merge**; sau khi `feat/auth-ui` merge tôi rebase lên `main` (có thể xung đột `gap-matrix.md`/`codemap.md`).
- Đổi `BETTER_AUTH_SECRET` làm hỏng mọi secret 2FA đã lưu (ADR 003) — thêm cảnh báo trong tài liệu vận hành và kiểm lúc khởi động nếu có thể.
- Rate limit dùng IP: sau Cloudflare Tunnel hoặc mạng dùng chung (NAT) nhiều người cùng IP — xô theo email giúp giảm chặn oan.
- Mất điện thoại và hết mã dự phòng: chưa có đường khôi phục (Admin hỗ trợ) — ghi gap matrix.

## Đề xuất thay đổi

- `13` §2: bổ sung ngưỡng cho đăng ký, gửi lại thư và nhập mã 2FA; ghi xô theo email; ghi nguồn IP (`CF-Connecting-IP`) sau Cloudflare Tunnel.
- `design/stitch/README.md`: ghi khác biệt "8 mã dự phòng" (Stitch) vs 10 (spec) và các nội dung bịa đã bỏ.

## Complexity tracking

| Nguyên tắc `AGENTS.md` | Vì sao cần | Phương án đơn giản hơn đã loại |
|---|---|---|
| "Thêm thư viện: nêu lý do + giấy phép" | `ioredis` (MIT) để nói chuyện với Valkey; `qrcode` (MIT) để vẽ QR | Tự viết client RESP / bộ tạo QR: dễ sai, khó kiểm chứng |
| "Không trừu tượng hóa sớm" | `RateLimiter` có hai cài đặt (Valkey, bộ nhớ) | Chỉ Valkey: mất khả năng dự phòng khi Valkey sập (đã nêu ở điểm chưa rõ) |
| "Ngoại lệ nguyên tắc #2" | Khóa Valkey trước khi có workspace dùng tiền tố `sys:` (ADR 001) | Khóa theo workspace: không có workspace lúc đăng nhập |
| "Gọi dịch vụ ngoài" (HIBP) | Cần bạn duyệt riêng (ở điểm chưa rõ) | Chỉ danh sách cục bộ: bắt được ít mật khẩu lộ hơn |

## Checklist plan

- [ ] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Chờ duyệt.** Chưa sửa code. (Còn 13 thẻ `[CẦN LÀM RÕ]` cần bạn trả lời.)

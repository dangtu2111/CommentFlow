# Kế hoạch `feat/dev-auto-login` — Đăng nhập tự động chỉ-dev (`/dev/login`)

## Việc

Mã gap matrix: không có (công cụ dev) · Spec liên quan: `docs/13_Security_Design.md` §2 (phiên, 2FA bắt buộc Owner/Admin).

**Tóm tắt:** chủ dự án muốn xem `/app/*` ở localhost mà không phải đăng nhập + 2FA mỗi lần. Thêm route `GET /dev/login` tạo MỘT PHIÊN THẬT cho Owner mẫu `[MẪU] Demo Shop` rồi chuyển tới `/app/...`. Không sửa cổng `requireAppUser`/`decideAppAccess`, không thêm đường vòng nào vào code sản phẩm. Rủi ro: một route tạo phiên không cần mật khẩu — nên mặc định TẮT, cần 3 khóa + loopback, sai khóa nào cũng 404.

## Điểm chưa rõ

Không có. (Chủ dự án đã giao việc và chọn phương án, 07/11/2026.)

## Tiêu chí nghiệm thu

1. Sai bất kỳ khóa nào (NODE_ENV=production; APP_ENV khác `dev`; DB khác `cf_dev` ở `DATABASE_URL`/`DATABASE_AUTH_URL`; thiếu `DEV_AUTO_LOGIN=1`; host không loopback; có header proxy) → 404 — kiểm bằng: `dev-auto-login.test.ts` (bảng tổ hợp).
2. `?next=` chỉ nhận `/app`, `/app/...`; mọi dạng ngoài (`//`, `\`, URL tuyệt đối, CR/LF, `%0d`, quá dài) → `/app/settings` — kiểm bằng: cùng test.
3. Cookie phiên ký đúng định dạng Better Auth — kiểm bằng: test `signSessionCookieValue` + thử tay ở dev (bước dưới).
4. Chỉ vào được user có tên `[MẪU]…`, email `owner.mau@example.test`, là Owner của workspace `[MẪU] Demo Shop` — kiểm bằng: đọc code route; thử tay.
5. Cổng 2FA của Owner không bị nới: seed đánh dấu `totp_enabled = true` cho Owner mẫu — kiểm bằng: typecheck + test seed hiện có; thử tay sau `pnpm dev:seed-demo`.
6. Production không phục vụ route — kiểm bằng: khóa NODE_ENV (test bảng) + gọi thử route khi `next build && next start` (nếu có môi trường).

## File sẽ đọc

`tools/dev-seed/src/{guard,credentials,seed}.ts`, `packages/saas-core/src/auth/{auth,flows,two-factor,cookies}.ts`, `apps/web/src/server/{auth,require-app-user,app-access,workspace-selection}.ts`, `apps/web/src/lib/apply-cookies.ts`.

## File sẽ sửa / tạo

- `apps/web/src/server/dev-auto-login.ts` (+ `.test.ts`): hàm quyết định thuần (khóa, loopback, `next`) + ký cookie.
- `apps/web/src/app/dev/login/route.ts`: route handler (ngoài `app/app/**`).
- `tools/dev-seed/src/seed.ts`: đánh dấu 2FA cho Owner mẫu (cả khi workspace mẫu đã có — không cần `--reset`).
- `env.example`: tên biến `DEV_AUTO_LOGIN` + mô tả.
- `docs/codemap.d/diem-vao-dev-login.md`, `docs/plans/quyet-dinh/q-dev-auto-login.md`, `docs/handoff/feat-dev-auto-login.md`.

## Migration

Không có.

## Vì sao không sửa cổng (`requireAppUser`)

Một nhánh "bỏ qua đăng nhập" trong cổng nằm ngay trong code sản phẩm, chỉ cách production một biến môi trường; lỗi cấu hình = mở toàn bộ `/app`. Route riêng thì cổng vẫn y nguyên: nếu route bị tắt/404, mọi thứ trở về như cũ; nếu bật nhầm, kẻ tấn công chỉ lấy được tài khoản mẫu `[MẪU]` trên DB `cf_dev` loopback.

## Test viết trước

`apps/web/src/server/dev-auto-login.test.ts` (đã viết trước code).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/server/dev-auto-login.test.ts`

## Cần kiểm chứng độc lập không?

Có — chạm phiên/auth: `verifier-security` một lần (diff + docs/13).

## Rủi ro / câu hỏi cho chủ dự án

- Owner mẫu có `totp_enabled=true` nhưng không có secret: đăng nhập bằng mật khẩu in ra sẽ đòi mã 2FA không có → dùng `/dev/login`.
- Chưa thử chạy trọn vòng trên DB thật trong phiên này (không có `.env`).
- Cách bật: `DEV_AUTO_LOGIN=1` trong `.env` (máy code) rồi mở `http://localhost:3000/dev/login`. Cách tắt: bỏ biến / để trống.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt (chủ dự án giao việc 07/11/2026).**

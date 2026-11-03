# Kế hoạch `feat/workspace-members` — Workspace, thành viên, lời mời, `requireAppUser()`

## Việc

Mã gap matrix: `GĐ0-TENANCY` (phần giao diện), `AUTH-INVITE`, `AUTH-HARDEN-4` mục (1), `UI-AUTH` (bộ chuyển workspace) · Spec: `docs/16` §3 GĐ0 · FR-001…005 · `docs/10` §3.1 (`workspaces`, `members`, `invitations`) · `docs/13` §2–§4 · `docs/07` UF-1 (bước đầu).

**Tóm tắt (2–3 câu):** Làm nốt phần còn lại của "cổng 0": người mới đăng ký tạo được workspace của mình (và phải bật 2FA ngay), chuyển qua lại giữa các workspace, Owner quản lý thành viên (đổi vai trò, tạm khóa, gỡ) và mời nhân viên qua email bằng đường link dùng một lần. Đồng thời thêm một "cổng bảo vệ chung" `requireAppUser()` (hàm kiểm: đã đăng nhập, email đã xác minh, đủ 2FA, còn là thành viên đang hoạt động, đúng vai trò) mà **mọi** trang/hành động trong `/app` bắt buộc gọi, kèm test quét để không ai quên. Rủi ro chính: nhận lời mời phải đọc bảng `invitations` khi chưa có ngữ cảnh workspace (cần một hàm DB hẹp, kiểm chứng kỹ) và không được lộ email nào đã có tài khoản.

Chia 5 mốc (commit riêng trong cùng nhánh; chạy trọn kịch bản cổng 0 ở mốc cuối):

| Mốc | Nội dung |
|---|---|
| M1 | `requireAppUser()` + test quét + chuyển các Server Action/trang `/app` hiện có sang dùng nó |
| M2 | Tạo workspace + bộ chuyển workspace (lựa chọn lưu phía server) |
| M3 | Thành viên: danh sách, đổi vai trò, tạm khóa, gỡ, Owner cuối cùng, `action_logs` |
| M4 | Lời mời: migration 0015 + hàm DB nhận lời mời + thư + rate limit + trang `/invite/<token>` |
| M5 | Test truy cập chéo A→B, kịch bản cổng 0 (vi + en), tài liệu, kiểm chứng độc lập |

## Điểm chưa rõ

[CẦN LÀM RÕ: Owner có được mời người khác làm **Owner** (không chỉ Staff) không? FR-003 ghi vai trò Owner/Staff, `members.role` cho phép cả hai. Khuyến nghị: **có** — Owner mới vẫn bị cổng 2FA bắt buộc bật 2FA trước khi làm được gì; Owner cuối cùng không bao giờ bị gỡ/hạ vai trò.]

[CẦN LÀM RÕ: "Lưu lựa chọn workspace phía server" làm thế nào? Khuyến nghị: **cookie httpOnly ký HMAC chỉ chứa id workspace đã chọn**; mỗi request server tra lại bảng `members` (còn `active` không) và bỏ lựa chọn nếu không còn → quay về workspace đầu tiên của bạn. Không thêm cột/bảng mới; không bao giờ nhận `workspace_id` từ form/URL. Phương án thay: cột `last_workspace_id` — cần cấp thêm quyền ghi cột `users` cho `cf_app`, nên loại.]

[CẦN LÀM RÕ: Người **chưa có tài khoản** nhận lời mời: vẫn bắt xác minh email như đăng ký thường (khuyến nghị — đơn giản, một đường đi duy nhất; sau khi xác minh thì tự quay lại chấp nhận lời mời), hay coi việc bấm link mời là đã xác minh email để bỏ một bước? Khuyến nghị: **vẫn bắt xác minh**.]

[CẦN LÀM RÕ: Hạn mức gửi lời mời. Khuyến nghị: **20 lời mời/giờ/workspace** và **3 lời mời/ngày cho mỗi email** (chống dùng hệ thống để gửi thư rác tới một người); quá hạn mức → báo "thử lại sau". Nhận lời mời: 10 lần thử/15 phút/người dùng (chống dò token).]

[CẦN LÀM RÕ: Có cần chức năng "tự rời workspace" trong nhánh này không? Khuyến nghị: **không** (ngoài phạm vi 1–6; Owner gỡ người khác, Owner cuối cùng không rời được). Ghi gap matrix `MEMBER-LEAVE` làm sau.]

Mặc định tôi sẽ áp dụng (không cần quyết định, sửa được nếu bạn muốn khác): hết hạn lời mời **7 ngày**; chỉ **Owner** thấy trang Thành viên và gọi được các hành động thành viên/lời mời (13 §3.1 "Kênh, thành viên … ❌ Staff"); thành viên `suspended`/`removed` không còn thấy workspace đó trong bộ chuyển, và nếu hết sạch workspace thì gặp màn tạo workspace; ngôn ngữ mặc định của workspace chỉ `vi`/`en` (ràng buộc CHECK sẵn có); múi giờ chọn trong danh sách IANA hợp lệ (mặc định `Asia/Ho_Chi_Minh`).

## Tiêu chí nghiệm thu

1. **Tạo workspace:** user đã xác minh email và chưa có workspace vào `/app` thì được đưa tới màn tạo workspace (tên, múi giờ mặc định `Asia/Ho_Chi_Minh`, ngôn ngữ mặc định); tạo xong → là Owner, bị cổng 2FA chuyển tới `/app/security` đến khi bật 2FA. Kiểm bằng: test tích hợp `workspace-members.int.test.ts` + bước 3–4 của kịch bản cổng 0.
2. **Bộ chuyển workspace:** liệt kê đúng các workspace mình là thành viên `active` (qua `withUser`); đổi workspace ghi cookie ký; sửa cookie, hoặc id workspace mình không thuộc/đã bị gỡ/tạm khóa → bị bỏ qua, không bao giờ vào được dữ liệu workspace đó. Kiểm bằng: test đơn vị cookie ký + test tích hợp "đã bị gỡ giữa chừng".
3. **`requireAppUser()`:** chặn (chuyển `/login`, `/app/security`, `/app/onboarding`, hoặc 404/403 tương ứng) khi: không phiên; email chưa xác minh; Owner/Admin chưa bật 2FA (trừ trang bảo mật); không còn membership `active` của workspace đang chọn; sai vai trò. Kiểm bằng: bảng test hành vi cho từng điều kiện.
4. **Test quét:** mọi file `page.tsx`, `route.ts`, `layout.tsx` ở `apps/web/src/app/app/**` và mọi hàm export của file `'use server'` ở đó phải gọi `requireAppUser` (hoặc nằm trong danh sách ngoại lệ có lý do, hiện chỉ trang `/app/security` được bỏ yêu cầu 2FA qua tùy chọn rõ ràng); thêm thử một action thiếu helper → test đỏ. Kiểm bằng: `pnpm --filter @flow/web exec vitest run src/server/require-app-user.scan.test.ts`.
5. **Thành viên:** Owner xem danh sách (chỉ id, tên, email, ảnh, vai trò, trạng thái); đổi vai trò, tạm khóa, mở khóa, gỡ (giữ dòng `status='removed'`); **không** hạ/khóa/gỡ được Owner `active` cuối cùng — kể cả hai yêu cầu chạy song song (chặn ở DB, không chỉ ở code); mỗi thay đổi ghi `action_logs` (actor, hành động, before/after) trong cùng giao dịch. Staff gọi các hành động này → bị từ chối. Kiểm bằng: test tích hợp, gồm ca đua song song.
6. **Lời mời — gửi/thu hồi/mời lại:** Owner đã bật 2FA mời theo email + vai trò; token 256-bit ngẫu nhiên, DB chỉ lưu SHA-256; hết hạn 7 ngày; thu hồi được; mời lại cùng email thì lời mời cũ mất hiệu lực (chỉ còn 1 lời mời đang chờ/email/workspace — ràng buộc duy nhất ở DB); thư gửi qua `notify` (Mailpit ở dev) bằng ngôn ngữ của workspace; vượt hạn mức → từ chối. Kiểm bằng: test tích hợp + `check-rls`.
7. **Lời mời — nhận:** đúng token + đúng email của tài khoản đang đăng nhập + chưa hết hạn/chưa dùng/chưa thu hồi → thành viên `active` đúng vai trò, lời mời đánh dấu đã dùng, **dùng lại lần hai thất bại**; email không khớp, token sai, hết hạn, đã dùng, đã thu hồi → **cùng một thông báo trung tính** (không lộ email nào có tài khoản, không lộ lý do cụ thể). Người chưa có tài khoản: đăng ký → xác minh → tự quay lại chấp nhận. Kiểm bằng: test tích hợp hàm DB + test luồng + so sánh nội dung phản hồi giữa các ca lỗi.
8. **Cô lập chéo workspace:** với user của workspace A, mọi action/route nhận id (member, lời mời) của workspace B → 404 (không 403, không lộ tồn tại). Kiểm bằng: test tích hợp duyệt danh sách mọi action/route đã đăng ký (danh sách lấy từ cùng nguồn với test quét, không viết tay riêng).
9. **Quyền DB:** `check-rls` xanh sau migration 0015; `cf_app` không UPDATE được `invitations.token_hash/accepted_at/expires_at/email`, không DELETE `invitations`; không gọi được hàm nhận lời mới với email không khớp user. Kiểm bằng: `pnpm db:check-rls` + test tích hợp quyền.
10. **Giao diện vi + en:** màn tạo workspace, bộ chuyển, Thành viên, nhận lời mời, thư mời đủ trạng thái (đang tải, lỗi, trống) ở cả hai ngôn ngữ; không còn nội dung bịa của Stitch; màu/chữ theo token. Kiểm bằng: `pnpm lint:i18n` + test khớp khóa vi/en + kịch bản cổng 0 bằng tay.
11. **Kịch bản cổng 0 chạy trọn ở local, cả vi và en:** đăng ký → xác minh → tạo workspace → bật 2FA → mời Staff → Staff nhận lời mời → chuyển workspace; báo kết quả từng bước. Kiểm bằng: chạy tay (Mailpit) và báo cáo cuối nhánh.
12. **Công cụ xanh:** `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans`, test phạm vi đã đổi, `pnpm test:db`, `pnpm db:check-rls`, `gitleaks`.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `packages/saas-core/src/auth/two-factor.ts` — `posture()`, `requiresTwoFactor`: tái dùng làm bước 2FA trong `requireAppUser`.
2. `apps/web/src/server/auth.ts` + `request-context.ts` — gốc lắp ráp (`getAuthRuntime`, `openTenancy`) để thêm `tenancy`, `invitations`, `limiter`.
3. `packages/saas-core/src/ratelimit/limiter.ts` — thêm hành động `invite`, `inviteAccept` và định danh `workspaceId`.
4. `packages/saas-core/src/notify/{templates,notifier}.ts` — thêm mẫu thư mời vi/en.
5. `packages/db/src/check-rls.ts` — bổ sung kiểm cho hàm SECURITY DEFINER và quyền cột `invitations`.
6. `apps/web/src/app/(auth)/actions.ts`, `lib/auth-form.ts`, `components/ui/fields.tsx` — mẫu Server Action/biểu mẫu; chuyển hướng sau đăng nhập/xác minh để quay lại lời mời.
7. `apps/web/src/app/app/(guarded)/{layout,page}.tsx`, `app/app/security/{page,actions}.tsx` — chuyển sang `requireAppUser`.
8. Ảnh Stitch đã xem: `settings-workspace-members.png`, `accept-invite.png`, `onboarding.png`, (còn `email-invite.png` khi làm thư) — chỉ các trang này.

Đã đọc khi lập plan (xin ghi nhận): `docs/10` §3.1/§3.7/§4, `docs/13` §2–§4, `docs/07` UF-1, `docs/16` §3, `packages/saas-core/src/tenancy/tenancy.ts`, `packages/db/src/schema/core/tenancy.ts`, migration 0001/0004/0006 (đoạn members/invitations/action_logs).

## File sẽ sửa / tạo

**DB (`packages/db`)**
- `migrations/0015_invitations_hardening.sql` (+ `meta/`) — cột `invited_by`, `revoked_at`; chỉ mục duy nhất một lời mời đang chờ/email/workspace; thu hẹp quyền `cf_app` trên `invitations`; hàm `core.invitation_preview` và `core.accept_invitation` (SECURITY DEFINER, `SET search_path`); trigger giữ Owner `active` cuối cùng trên `members`.
- `src/schema/core/tenancy.ts` — thêm cột mới; `src/check-rls.ts` — kiểm mới; `tests/invitations.int.test.ts` (mới), `tests/check-rls.int.test.ts` (bổ sung).

**saas-core**
- `src/tenancy/tenancy.ts` — thêm `updateMemberRole`, `setMemberStatus` (suspend/restore/remove), ghi `action_logs`, `getMembership`; `src/tenancy/invitations.ts` (mới) — `createInvitation`, `revokeInvitation`, `listInvitations`, `previewInvitation`, `acceptInvitation`; `src/tenancy/index.ts` xuất mới.
- `src/ratelimit/limiter.ts` — hành động mới; `src/notify/templates.ts` (+ test) — thư mời; `src/auth/pending-invite.ts` (mới) — cookie ký ghi nhớ lời mời đang chờ qua bước đăng nhập/đăng ký/xác minh.
- `tests/workspace-members.int.test.ts`, `tests/invitations.int.test.ts` (mới).

**Web (`apps/web`)**
- `src/server/require-app-user.ts` (+ `.test.ts`, `.scan.test.ts`) — cổng chung; `src/server/workspace-selection.ts` (+ test) — cookie ký lựa chọn workspace.
- `src/app/app/onboarding/workspace/{page,actions}.ts(x)` — tạo workspace; `src/app/app/(guarded)/members/{page,actions}.ts(x)` — Thành viên + mời; `src/app/invite/[token]/page.tsx` + `actions.ts` — nhận lời mời (ngoài `/app`, tự kiểm).
- `src/app/app/(guarded)/{layout,page}.tsx`, `src/app/app/security/{page,actions}.ts(x)` — dùng `requireAppUser`.
- `src/components/app/{workspace-switcher,create-workspace-form,members-table,invite-form,accept-invite-card}.tsx`; `src/lib/{members-form}.ts`; `styles/globals.css` — kiểu mới theo token.
- `packages/shared/src/i18n/messages/{vi,en}.json` — khóa `workspace.*`, `members.*`, `invite.*`, thư mời.

**Tài liệu:** `docs/gap-matrix.md`, `docs/codemap.md`, `docs/handoff/feat-workspace-members.md` (cuối phiên, xóa khi `/finish`), `design/stitch/README.md` (ghi nội dung bịa đã bỏ).

## Migration

`0015_invitations_hardening.sql` — **chỉ chạy `cf_dev`/`cf_test`/`cf_ci`**:
1. `invitations`: thêm `invited_by uuid REFERENCES core.users(id) ON DELETE SET NULL`, `revoked_at timestamptz`; chỉ mục duy nhất `(workspace_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL`.
2. Quyền `cf_app` trên `invitations`: `REVOKE UPDATE, DELETE`; `GRANT UPDATE (revoked_at)` (thu hồi). Policy tách theo lệnh (SELECT/INSERT/UPDATE) dựa vào `current_workspace_id()` như mẫu của `check-rls`.
3. `core.invitation_preview(p_token_hash text)` và `core.accept_invitation(p_token_hash text, p_user_id uuid)`: `SECURITY DEFINER`, `SET search_path = pg_catalog, core`, chủ sở hữu `cf_owner`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO cf_app`. `accept_invitation` trong một giao dịch: khóa dòng lời mời (`FOR UPDATE`), kiểm chưa hết hạn/chưa dùng/chưa thu hồi, **đọc `users.email` + `email_verified` của `p_user_id` bên trong hàm và so với email lời mời**, rồi thêm/kích hoạt `members` (nếu từng `removed` thì kích hoạt lại với vai trò mới; nếu đang `suspended` thì **không** tự mở khóa → coi như không hợp lệ), đánh dấu `accepted_at`, ghi `action_logs`. Trả về một kết quả duy nhất `workspace_id` hoặc NULL (mọi lý do thất bại giống nhau).
4. Trigger `BEFORE UPDATE ON core.members` từ chối thay đổi làm workspace không còn Owner `active` nào; khóa ghi trên dòng `workspaces` để hai giao dịch song song không cùng vượt qua.

Đường lùi: `DROP FUNCTION`, `DROP TRIGGER`, bỏ chỉ mục/cột, `GRANT UPDATE, DELETE ON core.invitations TO cf_app` (như 0001). Không thêm bảng nên không cần policy bảng mới; hai cột mới rỗng/NULL cho dữ liệu cũ.
Điều phải kiểm khi viết: `members`/`users` có `FORCE ROW LEVEL SECURITY` không (nếu không, chủ sở hữu bỏ qua RLS — hàm DEFINER chạy được; nếu có, hàm cần chính sách riêng cho `cf_owner`).

## Test viết trước

(logic quy tắc — viết trước khi code mốc tương ứng)
- `requireAppUser`: bảng điều kiện (không phiên / chưa xác minh / thiếu 2FA / hết membership / sai vai trò / workspace trong cookie không thuộc mình).
- Owner cuối cùng: hạ vai trò, khóa, gỡ, và hai yêu cầu song song.
- Token mời: sinh/băm, hết hạn, dùng một lần, thu hồi, mời lại làm mất hiệu lực lời cũ, email không khớp, phản hồi trung tính giống hệt giữa các ca lỗi.
- Cookie lựa chọn workspace: ký/sửa/hết hạn; cookie lời mời đang chờ: ký/hết hạn.
- Quét `requireAppUser` (có ca âm tính: tạo file giả thiếu helper → đỏ).
- Test truy cập chéo A→B cho mọi action/route nhận id.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/saas-core exec vitest run src/tenancy tests/workspace-members.int.test.ts tests/invitations.int.test.ts
pnpm --filter @flow/db exec vitest run tests/invitations.int.test.ts tests/check-rls.int.test.ts
pnpm --filter @flow/web exec vitest run src/server src/lib
pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm db:check-rls
```
Test tích hợp cần máy phụ bật và `.env` của chủ dự án.

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh**, theo yêu cầu: `verifier-security` (token mời, so khớp email, cổng `requireAppUser`, chống lộ tài khoản, cô lập A→B, cookie ký) và `verifier-db` (migration 0015, hàm SECURITY DEFINER, quyền cột, trigger Owner cuối, ràng buộc duy nhất). Đầu vào chỉ gồm diff + mục spec, không kèm lập luận của người viết.

## Rủi ro / câu hỏi cho chủ dự án

- **Hàm SECURITY DEFINER** là bề mặt rủi ro lớn nhất: nếu hàm sai thì ai có token (hoặc `cf_app` bị chiếm) có thể tự thêm mình vào workspace. Giảm bằng: so email *bên trong DB*, một kết quả duy nhất, `search_path` cố định, quyền chỉ cho `cf_app`, test quyền cột, verifier-db.
- **Đổi vai trò/gỡ ở tầng dịch vụ:** policy `members_update` hiện cho mọi `cf_app` trong workspace sửa mọi dòng; việc "chỉ Owner" do dịch vụ + `requireAppUser` ép (DB không biết người gọi vì `withWorkspace` không đặt `app.user_id`). Chỉ Owner cuối cùng được bảo vệ ở DB. Nếu muốn bảo vệ sâu hơn (DB tự biết người gọi) cần đổi `withWorkspace` — ngoài phạm vi, ghi gap matrix `RLS-ACTOR-CTX` thay vì làm lúc này.
- **Lời mời cho email đã là thành viên `active`:** trả về trung tính ("đã gửi lời mời nếu hợp lệ") và **không gửi thư** — giữ không lộ ai đã có trong workspace với người mời không phải Owner (chỉ Owner mời nên rủi ro thấp, nhưng giữ nhất quán).
- **Thư qua SMTP thật:** vẫn theo quyết định #7 — không bật trên staging/production cho tới khi có rate limit (nhánh này thêm rate limit mời nhưng đăng ký/quên/gửi lại đã có từ `feat/auth-security`; staging vẫn theo H5).
- **Màn hình Stitch lệch spec** (sẽ bỏ khi dựng, ghi vào `design/stitch/README.md`): kênh/gói cước/VietQR/xóa vĩnh viễn trong trang Thành viên; phân quyền theo kênh và "che số điện thoại" khi mời; huy hiệu "Meta Tech Partner/ISO 27001", token mời hiển thị, "Gateway SSL"; quy tắc mật khẩu "8 ký tự" (thật: 10); ô "Kích hoạt 2FA (Khuyên dùng)" trong form nhận lời mời (2FA là việc ở trang bảo mật, Owner bắt buộc); màn onboarding bước 1 "Tạo workspace" **chưa có thiết kế** → dựng tối giản theo khung thẻ của màn đăng nhập. Nếu bạn muốn vẽ thêm màn tạo workspace trong Stitch trước, báo tôi.

## Đề xuất thay đổi

Bằng lời, chờ bạn duyệt (không tự sửa `docs/01–16`):
- `docs/10` §3.1 dòng `invitations`: thêm `invited_by`, `revoked_at`, chỉ mục duy nhất một lời mời đang chờ/email; ghi hai hàm DEFINER và trigger Owner cuối vào mục RLS (§4).
- `docs/13` §3.1: làm rõ "Thành viên (xem/mời/đổi vai trò/gỡ)" chỉ Owner; thêm dòng "Nhận lời mời: đúng email đã xác minh".
- ADR mới `docs/decisions/005-loi-moi-thanh-vien.md` (token băm, hạn 7 ngày, phản hồi trung tính, hàm DEFINER, rate limit) — sẽ viết ở M4 nếu bạn đồng ý.

## Complexity tracking

- **Hàm SECURITY DEFINER trong DB** — đi ngược "truy vấn đi qua `withWorkspace()`" (nguyên tắc #2): nhận lời mời bắt buộc đọc `invitations` khi chưa thuộc workspace nào. Phương án đơn giản hơn đã loại: (a) cho `cf_app` đọc mọi lời mời theo hash — lộ bề mặt (đọc chéo workspace), (b) dùng pool `cf_auth` — mở rộng quyền của role xác thực sang bảng nghiệp vụ, vi phạm tách quyền 0010. Hàm hẹp là phương án nhỏ nhất đã được gap matrix nêu sẵn (`AUTH-INVITE`).
- **Thêm test quét mã nguồn (đọc file `.ts/.tsx` bằng regex/AST)** — không phải thư viện mới (dùng `node:fs` + vitest sẵn có); đổi lại là cách duy nhất ép "không action nào thiếu helper" theo yêu cầu 5. Phương án đơn giản hơn (dựa vào review) đã loại vì AUTH-HARDEN-4 chính là hậu quả của việc quên.
- Không thêm thư viện mới.

## Checklist plan

- [ ] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Chờ duyệt.** Chưa sửa code. (Còn 5 thẻ cần bạn trả lời; mỗi thẻ có khuyến nghị — trả lời "đồng ý khuyến nghị" là đủ.)

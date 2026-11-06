# Kế hoạch `feat-oauth-token-enc` — Mã hóa token OAuth trong `accounts`

## Việc

Mã gap matrix: `OAUTH-TOKEN-ENC` · Spec: `docs/13_Security_Design.md` §5.

**Tóm tắt:** Khi bật đăng nhập OAuth, bảng `accounts` (của Better Auth) sẽ lưu `access_token`/`refresh_token`/`id_token`. Việc này thêm lớp "niêm phong" các token đó bằng AES-256-GCM (mã hóa có xác thực) theo `TOKEN_ENC_KEYS`, có `key_version` để xoay khóa. `saas-core` không được import code sản phẩm nên nhận bộ mã hóa qua interface (bộ `createTokenCipher` của `@flow/connectors` khớp interface này và do nơi lắp ráp truyền vào). Không migration: phiên bản khóa nằm ngay trong chuỗi lưu (`enc:v<n>:<base64url>`) vì cột là `text`. Mặc định TẮT (không truyền cipher → hành vi cũ). Rủi ro: bật `encryptOAuthTokens` của Better Auth cùng lúc sẽ mã hóa hai lần → giữ nó tắt.

## Điểm chưa rõ

Không có. (Chọn: interface thay vì import connectors; phiên bản khóa trong chuỗi thay vì cột mới — Q-OTE1.)

## Tiêu chí nghiệm thu

1. Seal/open khứ hồi đúng cho mọi chuỗi (property-based); mỗi lần seal ra giá trị khác nhau — kiểm bằng: `oauth-token-vault.test.ts`.
2. Bản niêm phong không mở được khi sai user/provider/trường, hoặc bị sửa 1 ký tự; lỗi không chứa token/khóa — kiểm bằng: test.
3. Xoay khóa: dữ liệu v1 vẫn mở được khi cấu hình v1+v2; `rotateOAuthToken` đưa về v2; thiếu khóa v1 → lỗi cấu hình rõ — kiểm bằng: test.
4. `null`/`undefined` giữ nguyên; giá trị đã niêm phong không bị niêm phong lần hai; token cũ chưa mã hóa vẫn đọc được (chuyển tiếp) và được đánh dấu cần mã hóa lại — kiểm bằng: test.
5. Hook `createAuth` chỉ niêm phong khi truyền cipher; không truyền → dữ liệu nguyên vẹn — kiểm bằng: test hook thuần.
6. Công cụ xanh: lint, typecheck, depcruise, coverage ngưỡng — kiểm bằng: `pnpm precheck` + `test:coverage`.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/connectors/src/token-cipher.ts` (lớp đã có), `packages/saas-core/src/auth/auth.ts` (nơi gắn hook), `packages/saas-core/src/auth/index.ts` (export), `packages/db/src/schema/core/auth.ts` (cột), `docs/13` §5.

## File sẽ sửa / tạo

- `packages/saas-core/src/auth/oauth-token-vault.ts` (+ `.test.ts`): logic thuần seal/open/rotate.
- `packages/saas-core/src/auth/auth.ts`: option `oauthTokenCipher` + `databaseHooks.account` (create/update before).
- `packages/saas-core/src/auth/index.ts`: export.
- `packages/saas-core/package.json`, `pnpm-lock.yaml`: devDependency `fast-check` 4.10.2 (MIT, đã dùng ở gói khác) cho test property-based.
- Docs: file riêng quyết định, codemap, gap-matrix/MASTER dòng của việc, handoff, KT.

## Migration

Không có. Việc mã hóa lại hàng loạt (job quét `accounts`) cần đọc/ghi bảng bằng role riêng → ghi vào gap matrix (`OAUTH-TOKEN-ENC-ROTATE`), hàm `rotateOAuthToken` đã sẵn cho job đó.

## Test viết trước

Toàn bộ `oauth-token-vault.test.ts` viết trước khi có file nguồn.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/auth/oauth-token-vault.test.ts`; `pnpm --filter @flow/saas-core test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (token, mã hóa).

## Rủi ro / câu hỏi cho chủ dự án

Giao diện: chưa làm (chờ bộ thành phần chung). Chưa có nhà cung cấp OAuth đăng nhập nào bật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Thêm devDependency fast-check vào saas-core (đã dùng ở 3 gói khác): để có property-based test theo yêu cầu. Không vi phạm khác.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

Không có bảng mới.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec 13 §5 + Q-OTE1).

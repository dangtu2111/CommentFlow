# Kế hoạch `feat/fb-oauth` — Kết nối Facebook (Xong-mock)

## Việc

Mã gap matrix: `FB-OAUTH`, `WEBHOOK-SUBSCRIBE-VERIFY`, `TOKEN-KEY-STARTUP-WEB`, `CH-RECONNECT-ACTION` · Spec: FR-010 (docs/05), docs/12 §1, docs/13 §2/§5, ADR 007, ADR 010.

**Tóm tắt:** Owner bấm "Kết nối Facebook" → web chuyển sang Meta (có `state` ký, chống giả mạo yêu cầu) → Meta trả `code` về web → web đổi lấy token dài hạn, liệt kê Page, Owner chọn Page trong giới hạn gói → web lưu Page token đã mã hóa và đăng ký webhook cho đúng Page đó. Mọi cuộc gọi Meta đi qua một giao diện HTTP tiêm được; test dùng dữ liệu mẫu viết tay theo tài liệu Meta v27.0 (chưa gọi Meta thật). Cờ `FB_OAUTH_ENABLED` mặc định TẮT. Rủi ro: chưa thử với Page thật; web dùng đường hệ thống (`withJob`) để đặt `webhook_subscribed` vì cột này chỉ hệ thống đặt được (không migration).

## Điểm chưa rõ

Không có. Quyết định tự chọn ghi ở `QUYET_DINH_CHO_DUYET.md` Q5 (tên biến dùng lại `META_*`; giới hạn gói chưa có bảng `plans` → biến `CHANNELS_LIMIT_DEFAULT`; token người dùng giữa hai bước nằm trong cookie mã hóa, không DB).

## Tiêu chí nghiệm thu

1. `state` OAuth: sai/thiếu/hết hạn 10 phút/khác người dùng-workspace → từ chối, không gọi Meta — test `fb-oauth-state` + route.
2. Callback đổi `code` → token dài hạn → liệt kê Page (có phân trang) bằng client mock theo fixture v27.0; lỗi Meta chỉ ra mã, không lộ token/URL — test `oauth.test.ts`.
3. Chọn Page vượt giới hạn gói → từ chối trước mọi ghi; kết nối lại Page đã có không tính thêm — test `fb-connect.test.ts`.
4. WEBHOOK-SUBSCRIBE-VERIFY: `GET /me?fields=id` của token ≠ `external_id` → KHÔNG tạo kênh, KHÔNG subscribe, KHÔNG đặt `webhook_subscribed`; đúng → subscribe đích danh `POST /{external_id}/subscribed_apps`, xác nhận lại bằng GET rồi mới đặt cờ — test hồi quy.
5. Token Page được mã hóa (AAD workspace|channel|key_version) trước `setChannelToken`; không xuất hiện trong log/lỗi — test.
6. TOKEN-KEY-STARTUP-WEB: web (khi bật cờ) dừng khởi động nếu `TOKEN_ENC_KEYS` thiếu khóa cho phiên bản đang dùng — test `assert` + instrumentation.
7. CH-RECONNECT-ACTION: banner + trang Kênh có "Kết nối lại" cho Owner (không cho Staff) khi cờ bật — test `channel-banner`/hàm view.
8. Cờ tắt → route start/callback trả 404, UI ẩn nút — test.
9. `pnpm lint && lint:i18n && typecheck && depcruise` + test phạm vi xanh; verifier-security một lần.

## File sẽ đọc / sửa

Đã đọc: `connector.ts` (facebook), `channel-tokens.ts`, `0020_channel_token_functions.sql`, `signed-value.ts`, `env.ts`, `system-banners.tsx`, `app-nav.ts`, `verify-token-keys.ts`.
Tạo: `packages/connectors/src/facebook/{oauth.ts,oauth.fixtures.ts,oauth.test.ts}`; `packages/saas-core/src/auth/sealed-value.ts`(+test); `apps/web/src/server/{fb-oauth-env,fb-oauth-state,fb-connect,fb-connect-runtime}.ts`(+test); `apps/web/src/app/api/channels/facebook/{start,callback}/route.ts`; `apps/web/src/app/app/(guarded)/channels/{page.tsx,actions.ts}`; `apps/web/src/instrumentation.ts`.
Sửa: `connectors/src/index.ts`, `saas-core/src/auth/index.ts`, `app-nav.ts`, `system-banners.tsx`, `channel-banner.ts`, messages vi/en, `env.example`, docs (CAN_BAN_CUNG_CAP, KIEM_TRA_TAY, MASTER, gap-matrix, codemap, QUYET_DINH).

## Migration

Không có.

## Test viết trước

State/cookie niêm phong, đối chiếu danh tính Page, giới hạn gói, thứ tự thao tác (identity → create → token → subscribe → cờ).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/facebook`; `pnpm --filter @flow/saas-core exec vitest run src/auth/sealed-value.test.ts`; `pnpm --filter @flow/web exec vitest run`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (token, OAuth state, webhook đăng ký, đường `withJob`).

## Rủi ro / câu hỏi cho chủ dự án

Cần Meta App + Page thử (xem `docs/CAN_BAN_CUNG_CAP.md`). Không có câu hỏi chặn.

## Đề xuất thay đổi

Khi có bảng `plans`, thay `CHANNELS_LIMIT_DEFAULT` bằng `channels_limit` của gói.

## Complexity tracking

Không có thư viện mới. Thêm tiện ích niêm phong AES-GCM ở saas-core (một nơi dùng hôm nay; bắt buộc vì cookie chứa token người dùng — phương án ký-không-mã-hóa bị loại vì lộ token).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự chọn theo AGENTS.md § Quy tắc hỏi; ghi Q5).

# Kế hoạch `feat/channels-connect` — Cài đặt → Kênh: kết nối Facebook thật + kiểm tra quyền đã cấp đã đủ chưa

## Việc

Yêu cầu chủ dự án (12/11/2026): "chuyển qua phần cài đặt kênh đã kết nối, gắn backend vào, có thể kết nối FB và kiểm tra các quyền đã được cấp đã đủ chưa".

**Tóm tắt (2–3 câu dễ hiểu):** Trang Kênh đã có sẵn luồng kết nối Facebook (đăng nhập Meta → chọn Page → kết nối lại → kiểm kết nối → ngắt → đổi ngôn ngữ trả lời), phần còn thiếu là biết Meta đã CẤP những quyền nào (người dùng có thể bỏ chọn một quyền ở hộp thoại Meta) và đủ để chạy chưa. Nay hệ thống hỏi Meta (`debug_token`) quyền thực sự đã cấp: hiện bảng quyền ở bước chọn Page (trước khi kết nối), lưu quyền đã cấp của từng kênh khi kết nối, làm mới ở mỗi lần "Kiểm tra kết nối", báo thiếu quyền nào và tính năng nào bị ảnh hưởng, kèm nút "Cấp thêm quyền" (xin lại quyền). Rủi ro: chạm luồng token OAuth → tự kiểm, KHÔNG tự merge.

## Điểm chưa chốt

Chưa kiểm với Meta App + Page thật (xem `docs/can-ban-cung-cap.d/channels-fb-permissions.md`). Nút "Đồng bộ" từng kênh vẫn "Sắp có": cần quét bình luận theo yêu cầu (`POLLING-CHANNEL-LIST`, cờ `POLLING_ENABLED`), không thuộc PR này.

## Tiêu chí nghiệm thu

1. Bảng quyền bắt buộc (`FB_REQUIRED_PERMISSIONS`) gắn với tính năng (webhook / đọc / trả lời-ẩn); `evaluateFbPermissions` và `grantedScopesForTarget` (xét `granular_scopes` theo Page) có test.
2. Connector: `getTokenPermissions` (debug_token bằng token ỨNG DỤNG, không ký proof), `checkConnection` trả `grantedPermissions`; token hết hiệu lực → `TOKEN_EXPIRED`; lỗi hỏi quyền khác không làm hỏng kiểm webhook; id sai không gọi mạng. OAuth client: `debugToken`, `auth_type=rerequest`.
3. Kết nối: lưu quyền ĐÃ CẤP (không phải đã xin); hỏi lỗi → rỗng + cảnh báo mã lỗi; Page lệch danh tính không bị hỏi quyền; sau kết nối đẩy một lượt kiểm.
4. Worker: kiểm kênh ghi `channels.scopes` (kể cả rỗng), không ghi khi không đọc được, đúng workspace (test tích hợp `text[]`).
5. Giao diện: bước chọn Page hiện quyền đã cấp + "Cấp thêm quyền"; mỗi kênh Facebook hiện đủ/thiếu/chưa kiểm (không kết luận khi chưa kiểm), bảng quyền trong "Cài đặt nâng cao".
6. Không log token; thông báo lỗi chỉ mã; typecheck, `lint:i18n`, biome, depcruise, test xanh.

## File sẽ đọc / sửa

Thêm: `packages/shared/src/fb-permissions.ts`, `packages/connectors/src/facebook/debug-token.ts`, `apps/web/src/lib/channel-permissions.ts` (+ test từng file), `apps/worker/tests/channel-check.int.test.ts`.
Sửa: `packages/connectors/src/facebook/{connector,oauth}.ts`, `packages/connectors/src/types.ts`, `packages/db/src/queries/channels.ts`, `apps/worker/src/jobs/channel-check.ts`, `apps/web/src/server/{fb-connect,fb-connect-runtime}.ts`, `apps/web/src/app/api/channels/facebook/start/route.ts`, `apps/web/src/app/app/(guarded)/channels/{page,actions}.tsx`, `components/settings/channels-hub.tsx`, `lib/fb-connect-view.ts`, i18n `vi/en`.

## Migration

Không (`channels.scopes` đã có và `cf_app` đã được UPDATE cột này từ 0019; trigger chặn người dùng, chỉ hệ thống ghi).

## Test viết trước

fb-permissions (6), debug-token (4), oauth (rerequest + debugToken), connector (getTokenPermissions/checkConnection), channel-check (2 + int 2), fb-connect (3), channel-permissions (4).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared test` · `pnpm --filter @flow/connectors test` · `pnpm --filter @flow/worker exec vitest run src/jobs/channel-check.test.ts` · `pnpm --filter @flow/worker test:db tests/channel-check.int.test.ts` · `pnpm --filter @flow/web test`.

## Cần kiểm chứng độc lập không?

CÓ (chạm luồng token OAuth): tự kiểm theo `docs/workflows/verify.md` mục A — nhãn "tự kiểm, chưa có kiểm chứng độc lập"; PR mở, KHÔNG tự merge, chờ chủ dự án/Codex kiểm chéo.

## Rủi ro / câu hỏi cho chủ dự án

- `debug_token` dùng token ứng dụng (`appId|appSecret`) và đặt token Page vào query (cách Graph yêu cầu); không log, lỗi chỉ ra mã.
- Danh sách quyền bắt buộc (4 quyền) là đề xuất tối thiểu theo chức năng hiện có; đổi ở `fb-permissions.ts`.

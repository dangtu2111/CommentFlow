# Kế hoạch `feat/log-on-behalf-of` — Staff thấy dòng hệ thống do chính mình yêu cầu

## Việc

Mã gap matrix: `LOG-STAFF-SYSTEM-ROWS` · Spec: FR-092 (05), `docs/10` §3.1 (`action_logs`), `docs/13` §3.1 (dòng Nhật ký).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Khi Staff bấm gửi trả lời hoặc ẩn/bỏ ẩn, người làm thật sự là worker (hệ thống) nên dòng nhật ký `comment.replied`/`hidden`/`unhidden` mang `actor_type='system'` và Staff không thấy. Thêm cột `action_logs.on_behalf_of` (người yêu cầu) để Staff thấy đúng những dòng hệ thống do mình yêu cầu, còn dòng AI tự gửi, dòng của người khác và dòng hệ thống không rõ người yêu cầu vẫn ẩn. Trang Nhật ký ghi "Hệ thống (theo yêu cầu của bạn)".
Rủi ro: đổi policy SELECT và INSERT của `action_logs` (nhạy cảm); phải chắc người dùng thường không tự đặt `on_behalf_of` để ép/giả cho người khác nhìn.

## Điểm chưa rõ

Không có. Quyết định chủ dự án (05/11): cột `on_behalf_of uuid` lấy từ `requested_by`; policy Staff = `actor_id = mình` HOẶC (`actor_type='system'` và `on_behalf_of = mình`); Staff không thấy `ai`; Owner thấy cả workspace; UI "Hệ thống (theo yêu cầu của bạn)" / Owner xem: "theo yêu cầu của (tên)".

Lựa chọn kỹ thuật (do agent chọn, nêu lý do):
- **Không FK** tới `core.users`: theo quy ước repo (`actor_id`, `impersonation_id` đều uuid trần); nhật ký chỉ-thêm không được chặn/cascade theo người dùng. Thay bằng CHECK `on_behalf_of IS NULL OR actor_type = 'system'` (áp cả cho hàm DEFINER).
- **Ai được ghi cột:** chỉ đường hệ thống (`withJob` → worker). Policy INSERT hiện chỉ cho `system`/`ai` khi KHÔNG có người dùng (`current_user_id() IS NULL`); đường người dùng (`withActor`) chỉ INSERT được `actor_type='user'` → CHECK buộc `on_behalf_of` NULL. Thêm vào nhánh `user` của policy INSERT: `on_behalf_of IS NULL` (rõ ràng, check-rls kiểm). Không đổi quyền `cf_app` (vẫn chỉ SELECT + INSERT; cột không sửa được sau khi ghi).
- **Backfill:** CÓ, trong migration (chạy bằng owner, bảng chỉ-thêm với `cf_app` nên hợp lệ): dòng `actor_type='system'` với `action IN ('comment.replied','comment.hidden','comment.unhidden')` và `after->>'requested_by'` đúng dạng uuid → đặt `on_behalf_of`. Lý do: dòng cũ không hồi tố sẽ làm Staff thấy lịch sử thiếu; dữ liệu nguồn có sẵn, chính xác.
- **Chỉ mục:** KHÔNG tạo trong migration (CREATE INDEX trên bảng chỉ-thêm đang ghi sẽ khóa; CONCURRENTLY không chạy trong giao dịch migrate). Gộp vào `ACTION-LOGS-ACTOR-INDEX` (ghi nhận).

## Tiêu chí nghiệm thu

1. Staff thấy dòng `system` có `on_behalf_of` = mình; KHÔNG thấy dòng `system` của người khác, `system` không có `on_behalf_of`, và dòng `ai` — test DB `action-logs-on-behalf.int.test.ts` (RLS thô) + `action-logs.int.test.ts` (truy vấn).
2. Owner thấy mọi dòng workspace; người đã rời/tạm khóa không thấy gì; `withWorkspace` trần không đọc; workspace khác không thấy — test DB cùng file.
3. Ghi: đường người dùng (`withActor`) không INSERT được `actor_type='system'`, và dòng `user` với `on_behalf_of` khác NULL bị từ chối (RLS 42501); CHECK từ chối `on_behalf_of` khi `actor_type<>'system'` kể cả owner (23514); `withJob` ghi được `system` + `on_behalf_of`; `cf_app` không UPDATE/DELETE — test DB.
4. Backfill: dòng cũ có `after.requested_by` hợp lệ được điền; rỗng/không phải uuid thì NULL — test DB (chạy lại câu backfill trên dữ liệu seed).
5. Worker `send`/`hide` ghi `on_behalf_of` = `requested_by` (NULL khi không có) cho `comment.replied`/`hidden`/`unhidden` — test worker (int).
6. `listActionLogs`/`getActionLog`/`listActionLogActions`: `viewerConditions` của Staff khớp RLS và trả `onBehalfOfId` + `onBehalfOfName` — test `action-logs.int.test.ts`.
7. UI: dòng `system` có `on_behalf_of` hiện "Hệ thống (theo yêu cầu của bạn)" khi là chính người xem; "Hệ thống (theo yêu cầu của (tên))" cho Owner; không tên (người đã rời) → "thành viên cũ"; vi/en — test unit hàm thuần trong `lib/action-log-format.ts` + `pnpm lint:i18n`.
8. `pnpm db:check-rls` đạt và bắt hồi quy (marker `on_behalf_of` trong policy SELECT và INSERT của `core.action_logs`) — test `check-rls.test.ts`.
9. Công cụ xanh: biome, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test:trace, `pnpm test`, `test:coverage`, `test:db` phần liên quan.

## File sẽ đọc (đã đọc)

`0028_member_leave.sql` (policy hiện tại), `0016_owner_only_policies.sql` (policy INSERT), `apps/worker/src/jobs/send.ts`, `hide.ts` (đoạn ghi nhật ký), `packages/db/src/queries/action-logs.ts`, `packages/db/src/schema/core/platform.ts`, `check-rls.ts` (ACTOR_POLICIES), `components/activity/activity-{list,detail}.tsx`, `server/action-log.ts`, `lib/action-log-format.ts`, `activity/page.tsx`.

## File sẽ sửa / tạo

- `packages/db/migrations/0029_action_logs_on_behalf_of.sql` + `meta/0029_snapshot.json`, `_journal.json`; `packages/db/src/schema/core/platform.ts` (cột + CHECK).
- `packages/db/src/check-rls.ts` (+ `check-rls.test.ts`): marker `on_behalf_of` cho SELECT/INSERT.
- `packages/db/src/queries/action-logs.ts`: `viewerConditions`, thêm trường `onBehalfOf*`.
- `packages/db/tests/action-logs-on-behalf.int.test.ts` (mới), `action-logs.int.test.ts`.
- `apps/worker/src/jobs/send.ts`, `hide.ts` (+ test worker).
- `apps/web`: `components/activity/activity-{list,detail}.tsx`, `activity/page.tsx`, `lib/action-log-format.ts` (+ test), `packages/shared/src/i18n/messages/{vi,en}.json`.
- Docs: `docs/10`, `docs/13` §3.1 (dòng Nhật ký), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/testing/KIEM_TRA_TAY.md` (KT-012), `docs/handoff/feat-log-on-behalf-of.md`.

## Migration

`0029_action_logs_on_behalf_of.sql` (nhánh duy nhất có migration): `ALTER TABLE core.action_logs ADD COLUMN on_behalf_of uuid` (nullable, không default → không rewrite bảng) + CHECK `action_logs_on_behalf_of_check`; backfill; `DROP/CREATE POLICY action_logs_select` và `action_logs_insert` (giữ nguyên 0016 + `on_behalf_of IS NULL` ở nhánh user). Đường lùi ghi đầu file (LÙI worker/web trước; tạo lại policy 0016/0028; DROP CONSTRAINT/COLUMN).

## Test viết trước

`action-logs-on-behalf.int.test.ts`, test worker, test `actorDisplay`, test check-rls — thấy đỏ trước khi có migration/mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/action-logs-on-behalf.int.test.ts tests/action-logs.int.test.ts`, `pnpm --filter @flow/worker exec vitest run <file>`, `pnpm --filter @flow/web exec vitest run src/lib/action-log-format.test.ts`.

## Cần kiểm chứng độc lập không?

Có: RLS + migration → `verifier-db` và `verifier-security` (chủ dự án chạy một lần).

## Rủi ro / câu hỏi cho chủ dự án

- Worker bản cũ (chưa ghi `on_behalf_of`) chạy sau migrate vẫn hợp lệ (cột nullable) nhưng dòng mới sẽ không hiện cho Staff → triển khai: migrate rồi bật worker mới.
- Dòng `system` không có người yêu cầu (hoặc người yêu cầu không còn là thành viên active) chỉ Owner thấy.

## Đề xuất thay đổi

`docs/13` §3.1 dòng Nhật ký: bổ sung "gồm dòng hệ thống do chính mình yêu cầu" cho Staff (chủ dự án đã yêu cầu).

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

**Đã duyệt** (chủ dự án chốt quyết định 05/11 trong yêu cầu giao việc).

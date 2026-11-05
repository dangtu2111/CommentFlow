# Kế hoạch `feat/member-leave` — Thành viên tự rời workspace + RLS nhật ký cho Staff

## Việc

Mã gap matrix: `MEMBER-LEAVE` + `LOG-RLS-STAFF` · Spec: FR-003 (05), US-004 (04), `docs/10` §3.1 (members/action_logs), `docs/13` §3.1.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Cho phép mỗi thành viên tự rời một workspace (Staff rời tự do; Owner chỉ rời khi còn Owner khác đang hoạt động, Owner cuối phải chuyển quyền hoặc xóa workspace). Việc rời đi qua một hàm DB riêng (`core.leave_workspace`, kiểu SECURITY DEFINER = chạy với quyền chủ bảng nhưng tự kiểm người gọi), ghi nhật ký `member.left` và gửi email báo mọi Owner. Cùng migration, siết RLS (khóa dòng ở DB) của `action_logs`: Owner thấy cả workspace, Staff chỉ thấy dòng do chính mình làm — trước đây chỉ lọc ở truy vấn.
Rủi ro: policy đọc `action_logs` đổi nên mọi chỗ đọc nhật ký bằng `withWorkspace` trần (không biết người gọi) sẽ không còn thấy dòng; phải dùng `withActor` hoặc đường hệ thống.

## Điểm chưa rõ

Không có. Quyết định chủ dự án (05/11): (1) Staff tự rời; Owner chỉ rời khi còn ≥ 1 Owner `active` khác (lỗi mã rõ `CONFLICT`/trigger `members_last_owner`); ghi `member.left` + email báo tất cả Owner; (2) gộp LOG-RLS-STAFF vào cùng migration.

## Tiêu chí nghiệm thu

1. Staff gọi `core.leave_workspace` → `members.status='removed'`, ghi `action_logs` `member.left` (actor = chính người đó) — kiểm bằng: test DB `member-leave.int.test.ts`.
2. Owner cuối cùng bị chặn (lỗi `members_last_owner`, dòng không đổi); Owner khi còn Owner active khác rời được — test DB cùng file.
3. Hai Owner (chỉ có hai) rời cùng lúc → luôn còn ≥ 1 Owner active (một bên bị chặn) — test race trong `member-leave.int.test.ts`; hàm lấy khóa tư vấn theo workspace (`pg_advisory_xact_lock`).
4. Người đã rời không còn thấy dữ liệu workspace (không còn trong `listWorkspacesOfUser`, `is_workspace_member()` sai, không đọc được bình luận/nhật ký qua `withActor`) và không rời lần hai (CF404) — test DB.
5. Hàm DEFINER: `search_path = pg_catalog, core, cf, pg_temp`, PUBLIC/cf_auth không EXECUTE, cf_app có; chỉ MỘT tham số `p_workspace_id uuid`; không có user id trong tham số; người gọi = `app.user_id`; không có `app.user_id` → 42501 — test DB.
6. RLS `action_logs` SELECT: Owner đọc mọi dòng workspace; Staff chỉ `actor_type='user' AND actor_id` = mình; đường hệ thống (`withJob`/`withSystem`) đọc được; `withWorkspace` trần không đọc được; workspace khác không thấy — test DB `member-leave.int.test.ts` + `action-logs.int.test.ts` (trang Nhật ký vẫn đúng với Staff).
7. `pnpm db:check-rls` đạt và bắt hồi quy: thêm cặp policy `core.action_logs` SELECT marker `is_workspace_owner`, và kiểm hàm `leave_workspace` — test `check-rls.test.ts`.
8. `leaveWorkspace` (saas-core): validate, ánh xạ lỗi Owner cuối → `CONFLICT`, không phải thành viên → `NOT_FOUND`; email báo MỌI Owner còn lại (không báo người đã rời; không gửi nếu lỗi) — test `workspace-members.int.test.ts` + test mẫu thư `notify.test.ts`.
9. Giao diện: nút "Rời workspace" có hộp xác nhận (hai bước), chuỗi qua i18n vi/en (không chuỗi cứng trong JSX), sau khi rời chuyển sang workspace khác hoặc trang tạo workspace — kiểm bằng `pnpm lint:i18n`, test unit lib/nav, và KT-011 thủ công.
10. Công cụ xanh: biome, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test:trace, `pnpm test`, `pnpm test:db` phần đổi, `db:check-rls`.

## File sẽ đọc (đã đọc)

`workspace-admin.ts` (mẫu runMemberChange/notifyOwners), `0015` (trigger, mẫu hàm DEFINER), `0016` (hàm is_workspace_*), `check-rls.ts`, `action-logs.ts` (truy vấn Nhật ký), `members/page.tsx` + `actions.ts`, `app-nav.ts`, `templates.ts`.

## File sẽ sửa / tạo

- `packages/db/migrations/0028_member_leave.sql` + `meta/0028_snapshot.json`, `_journal.json`: hàm `core.leave_workspace`, policy `action_logs_select` mới.
- `packages/db/src/check-rls.ts` (+ `check-rls.test.ts`): kiểm policy action_logs SELECT và hàm leave.
- `packages/db/src/queries/action-logs.ts`: cập nhật chú thích (RLS giờ cũng ép; vẫn giữ `viewerConditions`).
- `packages/db/tests/member-leave.int.test.ts` (mới), sửa `action-logs.int.test.ts` nếu cần.
- `packages/saas-core/src/tenancy/workspace-admin.ts`: `leaveWorkspace`; `notify/templates.ts`: thêm `left`; test tương ứng; sửa test đang đọc `action_logs` bằng `withWorkspace` trần (nếu hỏng).
- `apps/web`: `components/app/leave-workspace.tsx` (nút + xác nhận), `app/app/(guarded)/leave/page.tsx` + `actions.ts` (cho cả Staff), thêm khối vào trang Thành viên (Owner), `app-nav.ts` + test, `members-errors`/`members-form` (khóa lỗi), `packages/shared/src/i18n/messages/{vi,en}.json`.
- Docs: `docs/10_Database_Design.md`, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/testing/KIEM_TRA_TAY.md` (KT-011), `docs/13` nếu cần.

## Migration

`0028_member_leave.sql` (nhánh duy nhất có migration):
- `core.leave_workspace(p_workspace_id uuid) RETURNS TABLE(left_role text)` DEFINER, `search_path = pg_catalog, core, cf, pg_temp`, REVOKE PUBLIC, GRANT cf_app. Người gọi = `core.current_user_id()`; yêu cầu `app.workspace_id` NULL hoặc trùng tham số. Khóa tư vấn theo workspace → khóa dòng thành viên → nếu Owner mà không còn Owner active khác → lỗi `check_violation` constraint `members_last_owner` (cùng mã với trigger, nên ánh xạ chung) → UPDATE `status='removed'` → ghi `action_logs` (`member.left`).
- `DROP POLICY action_logs_select` + tạo lại: `workspace_id = ws AND (is_system_context() OR is_workspace_owner() OR (actor_type='user' AND actor_id = current_user_id() AND is_workspace_member()))`.
- Đường lùi (ghi ở đầu file): LÙI CODE TRƯỚC; DROP FUNCTION core.leave_workspace(uuid); tạo lại policy bản 0001.

## Test viết trước

`packages/db/tests/member-leave.int.test.ts` (tiêu chí 1–6), test check-rls, test `leaveWorkspace`, test mẫu thư, test nav — viết và thấy đỏ trước khi có hàm.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/member-leave.int.test.ts` (và `action-logs`), `pnpm --filter @flow/saas-core exec vitest run ...`, `pnpm --filter @flow/web exec vitest run ...`.

## Cần kiểm chứng độc lập không?

Có: RLS + migration + hàm DEFINER + quyền Owner → `verifier-security` và `verifier-db` (chủ dự án chạy một lần).

## Rủi ro / câu hỏi cho chủ dự án

- Staff không vào được trang Thành viên (docs/13 §3.1: 404). Quyết định chủ dự án: lối vào ở bộ chuyển workspace (cả Owner và Staff) dẫn tới `/app/leave`; không có mục menu chính, không có khối ở trang Thành viên. Owner cuối: giải thích + link Thành viên, không có nút.
- Thành viên đang `suspended` không tự rời được (chỉ `active`).
- Dòng nhật ký của người đã rời vẫn còn (Owner xem được); Staff đã rời không đọc được nữa.

## Đề xuất thay đổi

`docs/13` §3.1: thêm dòng "Tự rời workspace (Owner chỉ khi còn Owner khác)" cho cả hai vai trò.

## Complexity tracking

Không có (một trang `/app/leave` thêm vì Staff không vào Thành viên; component dùng ở hai nơi).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới" (không có bảng mới)

## Trạng thái duyệt

**Đã duyệt** (chủ dự án giao việc 05/11 với quyết định đã chốt; điểm đặt nút cho Staff ghi ở Rủi ro để xác nhận sau).

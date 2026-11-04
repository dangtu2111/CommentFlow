# Kế hoạch `feat/members-invite-only` — thành viên chỉ vào qua lời mời

## Việc

Mã gap matrix: `MEMBER-DIRECT-ADD` · Spec: `docs/13` §3.1, ADR 005 (§1 lời mời, §3 chỉ-Owner), `docs/10` §3.1/§4 · Gốc: ghi nhận của `verifier-db` ở PR #11.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Hiện Owner có thể thêm thẳng một người vào workspace (hàm `addMember` + policy cho phép Owner INSERT vào `members`) mà người đó không đồng ý hay biết; workspace thậm chí hiện trong danh sách của họ. Nhánh này bỏ đường đó: thành viên chỉ vào bằng cách **nhận lời mời** (hàm DB `accept_invitation`, đã kiểm email) hoặc là **Owner đầu tiên** của workspace do chính họ tạo. Rủi ro thấp: web chưa dùng `addMember` ở đâu; chủ yếu là sửa test chuyển sang hàm seed chỉ dùng trong test.

## Điểm chưa rõ

Không có. Quyết định của chủ dự án (03/11/2026): **bỏ** việc Owner thêm thẳng thành viên; thành viên chỉ vào qua lời mời; test chuyển sang hàm seed chỉ dùng trong test; làm ở nhánh nhỏ; gộp phần đổi sau verifier của PR #11 (`workspaces.created_by` + `workspace_bootstrap_open`, quyền cột `members`, đảo logic `check-rls`, `action_logs` chỉ system/ai khi không có người dùng) vào kiểm chứng của nhánh này.

## Tiêu chí nghiệm thu

1. Không ai (kể cả Owner đang hoạt động) INSERT được `members` qua `withActor`/`withWorkspace`, **trừ** đường khởi tạo: người tạo workspace tự thêm mình làm `owner` khi workspace chưa có thành viên — kiểm bằng: test ma trận `actor-rls.int.test.ts` (Owner INSERT staff/owner → bị chặn lỗi RLS 42501).
2. `accept_invitation` (hàm DEFINER) vẫn thêm/kích hoạt lại thành viên bình thường — kiểm bằng: `invitations.int.test.ts` và `workspace-members.int.test.ts` hiện có xanh.
3. `tenancy.addMember` không còn trong mã và export; `createWorkspace` vẫn tạo Owner đầu tiên — kiểm bằng: `pnpm typecheck` + `tenancy.int.test.ts`.
4. Mọi test từng dùng `addMember` để dựng dữ liệu chuyển sang hàm seed test-only (`packages/saas-core/tests/helpers.ts`, ghi bằng quyền chủ sở hữu, không export từ `src/`) — kiểm bằng: toàn bộ test tích hợp saas-core xanh; `grep addMember` trong `src/` rỗng.
5. `check-rls`: policy `members` INSERT phải chứa kiểm đường khởi tạo (`workspace_bootstrap_open`) và KHÔNG còn nhánh `is_workspace_owner`; thêm policy permissive thứ hai cho `members` INSERT làm `check-rls` đỏ — kiểm bằng: test `check-rls` (thật + mô phỏng).
6. Kiểm chứng độc lập một lần (`verifier-db` + `verifier-security`) trên toàn bộ diff của nhánh **và** phần đổi sau verifier của PR #11; sửa hết "Chặn merge" — kiểm bằng: báo cáo verifier trong PR.
7. Công cụ xanh: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations`, `pnpm test`, `pnpm test:db` (db, saas-core, worker), `pnpm db:check-rls`.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `packages/saas-core/src/tenancy/tenancy.ts` — xóa `addMember`.
2. `packages/saas-core/src/tenancy/index.ts` — export.
3. `packages/db/migrations/0016_owner_only_policies.sql` — policy `members_insert` hiện tại để thay.
4. `packages/db/src/check-rls.ts` — `ACTOR_POLICIES` (marker cho `members` INSERT).
5. `packages/db/tests/actor-rls.int.test.ts` — ma trận members INSERT.
6. `packages/saas-core/tests/{tenancy,two-factor,workspace-members}.int.test.ts`, `tests/helpers.ts` — nơi dùng `addMember`.
7. `docs/10_Database_Design.md` §4, `docs/decisions/005-loi-moi-thanh-vien.md` §3, `docs/codemap.md` — cập nhật mô tả.

## File sẽ sửa / tạo

- `packages/db/migrations/0017_members_invite_only.sql` (+ `meta/`) — thay `members_insert`.
- `packages/saas-core/src/tenancy/tenancy.ts` (bỏ `addMember`), `packages/saas-core/tests/helpers.ts` (hàm seed test-only `seedMemberForTest`), các test saas-core dùng `addMember`; viết lại nhóm `addMember` của `tenancy.int.test.ts` thành test "không có đường thêm thẳng".
- `packages/db/src/check-rls.ts` (marker), `packages/db/tests/actor-rls.int.test.ts`, `packages/db/tests/check-rls.int.test.ts`.
- `docs/10_Database_Design.md`, `docs/decisions/005-loi-moi-thanh-vien.md`, `docs/codemap.md`, `docs/gap-matrix.md` (`MEMBER-DIRECT-ADD` ✅), `docs/testing/KIEM_TRA_TAY.md` (không đổi — luồng mời không đổi).

## Migration

`0017_members_invite_only.sql`: `DROP POLICY members_insert` rồi tạo lại **chỉ** đường khởi tạo: `workspace_id = current_workspace_id() AND role = 'owner' AND user_id = current_user_id() AND invited_by IS NULL AND workspace_bootstrap_open()`. Không đổi cột, không đổi quyền. Đường lùi (comment cuối file): tạo lại `members_insert` bản 0016 (có nhánh `is_workspace_owner()`). Tương thích ngược: mã cũ gọi `addMember` sẽ bị chặn (không có mã cũ nào dùng ngoài test).

## Test viết trước

- `actor-rls.int.test.ts`: Owner INSERT `members` (staff, owner) → bị chặn (đỏ trước khi đổi policy).
- `check-rls`: policy `members` INSERT còn nhánh Owner → đỏ.
- `tenancy.int.test.ts`: không còn API thêm thẳng; người tạo workspace vẫn là Owner; nhận lời mời vẫn thêm được.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/actor-rls.int.test.ts tests/check-rls.int.test.ts tests/invitations.int.test.ts
pnpm --filter @flow/db exec vitest run src
pnpm --filter @flow/saas-core exec vitest run -c vitest.int.config.ts tests/tenancy.int.test.ts tests/workspace-members.int.test.ts tests/two-factor.int.test.ts
pnpm db:check-rls && pnpm lint && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations
```

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh** (`verifier-db` + `verifier-security`, model Opus), phạm vi: migration 0017 **và** các thay đổi sau verifier của PR #11 (migration 0016: `created_by` + `workspace_bootstrap_open`, quyền cột `members`, `check-rls` đảo logic, `action_logs`). Đầu vào: diff + mục spec, không kèm lập luận của người viết.

## Rủi ro / câu hỏi cho chủ dự án

- Không còn cách thêm người "ngay lập tức" không cần họ đồng ý: đúng chủ ý (FR-003 chỉ có mời). Nếu sau này cần "thêm nhân viên nội bộ không qua email" thì làm bằng chức năng riêng có đồng ý của người đó.
- Hàm seed test-only ghi bằng quyền chủ sở hữu DB test, nằm ở `tests/` — không bao giờ được import từ `src/` hay `apps/` (luật depcruise hiện tại đã cấm `src` import `tests`).

## Đề xuất thay đổi

Cập nhật bằng lời đã được chủ dự án cho phép ở đợt trước (docs/10 §4, ADR 005 §3): ghi "`members` INSERT chỉ còn đường khởi tạo; thành viên khác vào qua `accept_invitation`".

## Complexity tracking

Không có (xóa mã, không thêm thư viện/tầng trừu tượng).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy ghi theo vai trò hay chỉ theo workspace — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11/2026: quyết định bỏ `MEMBER-DIRECT-ADD`, làm ở nhánh nhỏ, gộp phần sau verifier PR #11).

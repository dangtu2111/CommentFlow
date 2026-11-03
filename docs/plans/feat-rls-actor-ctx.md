# Kế hoạch `feat/rls-actor-ctx` — DB tự biết "ai đang gọi" cho các thao tác chỉ-Owner

## Việc

Mã gap matrix: `RLS-ACTOR-CTX` (ưu tiên đầu GĐ1) · Spec: `docs/10` §4 (RLS), `docs/13` §3.1, §4, ADR 005 §3 · Ghi chú của verifier `feat/workspace-members` (policy chỉ kiểm `workspace_id`).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Hiện `withWorkspace` chỉ cho DB biết *workspace nào*, không biết *người nào* đang thao tác, nên "chỉ Owner được mời/đổi vai trò/gỡ người" chỉ do code kiểm; nếu một đoạn code sau này quên kiểm, DB vẫn cho qua. Nhánh này thêm đường truy cập `withActor(workspace, người dùng)` đặt cả hai vào DB và đổi policy của `members`, `invitations`, `workspaces` (sửa) thành "phải là Owner đang hoạt động của workspace đó", để quên kiểm ở code cũng không làm lộ quyền. Rủi ro: policy tham chiếu chính bảng `members` dễ gây đệ quy RLS, và đổi `withWorkspace` có thể làm hỏng truy vấn đang chạy — nên giữ `withWorkspace` nguyên, thêm đường mới, và chỉ tiến hành một mình (có migration).

## Điểm chưa rõ

Quyết định của chủ dự án (đồng ý khuyến nghị cả bốn thẻ, kèm bổ sung):

1. Quyết định: **giữ `withWorkspace(id, fn)`, thêm `withActor(workspaceId, userId, fn)`.**
2. Quyết định: **phạm vi bảng: `members` (INSERT/UPDATE), `invitations` (SELECT/INSERT/UPDATE), `workspaces` (UPDATE), `action_logs` (INSERT).** Bảng GĐ1 áp cùng mẫu khi được tạo.
3. Quyết định: **`REVOKE SELECT (token_hash)` khỏi `cf_app`.**
4. Quyết định: **đường khởi tạo `createWorkspace`** bằng hàm DEFINER hẹp `core.workspace_has_members(uuid)`.
5. Bổ sung (chủ dự án): **chấp nhận giới hạn** — bảo vệ này chống quên kiểm quyền/sai id (IDOR), KHÔNG chống tiến trình web bị chiếm hoàn toàn (kẻ đó tự đặt `app.user_id`). **Ghi giới hạn này vào ADR 005** (mục 3) trong cùng nhánh.
6. Bổ sung (chủ dự án): kiểm chứng độc lập bằng verifier **opus** (một lần ở cuối nhánh).

## Tiêu chí nghiệm thu

1. `withActor(ws, user, fn)` đặt `app.workspace_id` và `app.user_id` trong giao dịch, kiểm UUID, và đặt lại mọi biến ngữ cảnh trước (như `withWorkspace`); `withWorkspace` không đổi hành vi cho truy vấn hiện có — kiểm bằng: test `with-workspace`/`no-context` hiện có vẫn xanh + test mới cho `withActor`.
2. **Chỉ Owner đang hoạt động** của workspace W: INSERT/UPDATE `members`, SELECT/INSERT/UPDATE `invitations`, UPDATE `workspaces` thành công qua `withActor(W, owner)`; **thất bại (lỗi RLS, không phải "0 dòng im lặng" cho INSERT)** khi: người gọi là Staff của W; Owner của workspace khác (dùng id của W); thành viên `suspended`/`removed`; không có người dùng (`withWorkspace` thuần); người dùng không tồn tại — kiểm bằng: test tích hợp `actor-rls.int.test.ts` (ma trận vai trò × bảng × lệnh).
3. Đường khởi tạo: `createWorkspace` vẫn chạy (người tạo thành Owner); nhưng người khác không tự chèn mình làm Owner vào workspace đã có thành viên, kể cả qua `withActor` — kiểm bằng: test tích hợp (chèn Owner thứ hai bởi Staff/người lạ bị từ chối; bởi Owner thì được).
4. `action_logs`: INSERT với `actor_type='user'` chỉ được khi `actor_id = app.user_id`; `actor_type` khác (`system`/`ai`/`admin`) chỉ qua `withWorkspace` không người dùng, và không giả `actor_id` của người khác — kiểm bằng: test tích hợp.
5. `invitations.token_hash` không đọc được bằng `cf_app`; liệt kê lời mời, tạo, thu hồi, xem trước/nhận vẫn chạy — kiểm bằng: test quyền cột + test `workspace-members.int.test.ts` hiện có (đã đổi sang `withActor`) xanh.
6. `saas-core` (`createTenancy`, `createWorkspaceAdmin`) dùng `withActor` cho mọi thao tác ghi chỉ-Owner; kiểm `assertOwner` ở code **giữ lại** (lỗi dễ hiểu, lớp thứ hai), lỗi RLS còn lại map về `AppError('FORBIDDEN')` — kiểm bằng: test hiện có xanh + test "bỏ `assertOwner` thì DB vẫn chặn" (gọi thẳng SQL qua `withActor` bằng Staff).
7. `check-rls` đỏ khi: gỡ policy chỉ-Owner khỏi bảng trong phạm vi; policy chỉ-Owner thành `workspace_id = ...` đơn thuần; hàm `core.is_workspace_owner()`/`core.workspace_has_members()` mất `search_path` cố định hoặc cấp EXECUTE cho PUBLIC — kiểm bằng: test `check-rls` (thật + mô phỏng).
8. Không đệ quy RLS: truy vấn `members` qua `withActor` không báo `infinite recursion detected in policy`; hiệu năng: chỉ mục `members(workspace_id, user_id)` được dùng (EXPLAIN nằm trong test hoặc ghi chú) — kiểm bằng: test tích hợp + `verifier-db`.
9. Công cụ xanh: `pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise && pnpm check:plans`, `pnpm test:db`, `pnpm db:check-rls`; kiểm chứng độc lập một lần.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `packages/db/src/client.ts` — thêm `withActor`, giữ `NO_CONTEXT`.
2. `packages/db/migrations/0001_rls_and_grants.sql`, `0004_*`, `0008_*`, `0010_*`, `0015_*` (chỉ đoạn `members`/`invitations`/`workspaces`/`action_logs`) — policy hiện có để thay đúng tên.
3. `packages/db/src/check-rls.ts` — thêm kiểm chỉ-Owner, hàm DEFINER mới.
4. `packages/saas-core/src/tenancy/tenancy.ts` — `createWorkspace`, `addMember` chuyển sang `withActor`.
5. `packages/saas-core/src/tenancy/workspace-admin.ts` — mọi thao tác ghi Owner chuyển sang `withActor`, map lỗi RLS.
6. `packages/db/tests/{helpers,rls.int.test.ts,invitations.int.test.ts}`, `packages/saas-core/tests/workspace-members.int.test.ts` — cập nhật theo API mới, mẫu test.
7. `docs/10_Database_Design.md` §4, `docs/13_Security_Design.md` §3.1 — chỗ ghi quy tắc.
8. `docs/decisions/005-loi-moi-thanh-vien.md` §3 — cập nhật "kiểm quyền ở dịch vụ" thành "dịch vụ + DB".

## File sẽ sửa / tạo

- `packages/db/migrations/0016_owner_only_policies.sql` (+ `meta/`) — hàm DEFINER `core.is_workspace_owner()` và `core.workspace_has_members(uuid)` (STABLE, `search_path = pg_catalog, core, pg_temp`, EXECUTE chỉ cf_app); policy mới thay policy ghi của `members`, `invitations`, `workspaces`, `action_logs`; `REVOKE SELECT (token_hash)`; chỉ mục `members(workspace_id, user_id)` nếu thiếu (đã có unique cùng cột → chỉ kiểm).
- `packages/db/src/client.ts` — `withActor` (+ kiểu `FlowDb`), `packages/db/src/runtime.ts` xuất.
- `packages/db/src/check-rls.ts` (+ test), `packages/db/src/schema/` (không đổi cột).
- `packages/saas-core/src/tenancy/{tenancy,workspace-admin}.ts` — dùng `withActor`; `packages/saas-core/src/tenancy/index.ts` không đổi API ngoài.
- Test: `packages/db/tests/actor-rls.int.test.ts` (mới), cập nhật `invitations.int.test.ts`, `rls.int.test.ts`, `workspace-members.int.test.ts`.
- Tài liệu: `docs/10` §4, `docs/13` §3.1, ADR 005 §3, `docs/codemap.md` (bẫy: `withActor`, `token_hash` không đọc được), `docs/gap-matrix.md` (`RLS-ACTOR-CTX` ✅; ghi mẫu cho GĐ1).

## Migration

`0016_owner_only_policies.sql`:
1. Hàm `core.is_workspace_owner()` — true khi `app.user_id` là Owner `active` của `app.workspace_id`; `core.workspace_has_members(uuid)` — true khi workspace đã có ít nhất một dòng `members`. Cả hai `SECURITY DEFINER`, `STABLE`, `SET search_path = pg_catalog, core, pg_temp`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO cf_app`.
2. `members`: thay `members_insert`/`members_update` — Owner hoạt động (hoặc đường khởi tạo `role='owner' AND user_id = người gọi AND NOT workspace_has_members(workspace_id)`), vẫn giới hạn `workspace_id = current_workspace_id()`. SELECT giữ nguyên.
3. `invitations`: SELECT/INSERT/UPDATE đòi `is_workspace_owner()` (giữ điều kiện cột hiện có của 0015); `REVOKE SELECT (token_hash)` (REVOKE SELECT bảng + GRANT SELECT các cột còn lại).
4. `workspaces`: `workspaces_update` đòi `is_workspace_owner()`; INSERT giữ cho đường tạo (`id = current_workspace_id()`).
5. `action_logs_insert`: thêm `(actor_type <> 'user' AND app.user_id IS NULL) OR (actor_type = 'user' AND actor_id = current_user_id())`.

Đường lùi (comment cuối file): tạo lại policy bản 0001/0004/0015, `GRANT SELECT (token_hash)`, `DROP FUNCTION` hai hàm. Tương thích ngược: bản code cũ dùng `withWorkspace` sẽ **không ghi được** `members`/`invitations`/`workspaces` — nên triển khai migration cùng lúc với code mới (ghi trong PR).

## Test viết trước

(logic quy tắc — viết trước khi code)
- Ma trận `actor-rls.int.test.ts`: {Owner W, Staff W, Owner khác, suspended, removed, không người dùng, người lạ} × {members INSERT/UPDATE, invitations SELECT/INSERT/UPDATE, workspaces UPDATE, action_logs INSERT} cho kết quả đúng.
- Đường khởi tạo `createWorkspace` + chặn tự phong Owner.
- Không đệ quy; quyền cột `token_hash`; `check-rls` bắt hồi quy.
- Test hiện có chuyển sang `withActor` ở phần ghi chỉ-Owner.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/actor-rls.int.test.ts tests/invitations.int.test.ts tests/rls.int.test.ts tests/check-rls.int.test.ts
pnpm --filter @flow/db exec vitest run src
pnpm --filter @flow/saas-core exec vitest run -c vitest.int.config.ts tests/workspace-members.int.test.ts tests/tenancy.int.test.ts
pnpm db:check-rls && pnpm lint && pnpm typecheck && pnpm depcruise && pnpm check:plans
```

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh:** `verifier-db` (migration 0016, policy, hàm DEFINER, đệ quy RLS, đường lùi) và `verifier-security` (cô lập actor, đường khởi tạo, giả `actor_id`, `token_hash`). Trọng tâm: không có đường nào ghi `members`/`invitations`/`workspaces` mà không phải Owner đang hoạt động.

## Rủi ro / câu hỏi cho chủ dự án

- **Giới hạn bảo vệ:** `app.user_id` vẫn do mã ứng dụng đặt. Nhánh này chống *quên kiểm quyền / sai id (IDOR)*, **không** chống một tiến trình web đã bị chiếm hoàn toàn (khi đó kẻ tấn công tự đặt `app.user_id`). Chống kịch bản đó cần tách role/chữ ký phiên ở DB — ngoài phạm vi, ghi gap matrix nếu bạn muốn.
- **Hiệu năng:** mỗi ghi vào bảng chỉ-Owner thêm một truy vấn `members` (có chỉ mục, STABLE) — chấp nhận.
- **Một mình một làn:** nhánh sửa `withWorkspace`-gần và có migration; không chạy song song với nhánh khác có migration.
- **Chuyển đổi:** từ nay bảng GĐ1 mới phải khai báo "ai được ghi" ngay ở policy (mẫu `is_workspace_owner` cho thao tác Owner; Staff dùng điều kiện thành viên) — ghi vào `docs/workflows/feature.md`? (đề xuất bên dưới).

## Đề xuất thay đổi

- `docs/10` §4: thêm mục "Ngữ cảnh người gọi (`withActor`) và policy chỉ-Owner"; sửa dòng `invitations` (cột `token_hash` không đọc được bằng `cf_app`).
- `docs/13` §3.1: ghi "ép ở cả tầng dịch vụ và DB (RLS)" cho các hàng Owner-only của thành viên.
- ADR 005 §3: thay "kiểm quyền ở dịch vụ… DB không biết người gọi" bằng mô tả `withActor`.
- `docs/workflows/feature.md`: thêm một dòng vào Checklist plan cho nhánh có bảng mới: "mỗi bảng mới nêu policy ghi theo vai trò (withActor) hay chỉ theo workspace".

## Complexity tracking

- **Thêm hàm `SECURITY DEFINER` và đường truy cập `withActor`** — vi phạm tinh thần "mọi truy vấn đi qua `withWorkspace()`" (nguyên tắc #2): cần để policy đọc `members` mà không đệ quy RLS và để DB biết người gọi. Phương án đơn giản hơn đã loại: (a) kiểm quyền chỉ ở code (hiện trạng — chính là điều cần thay), (b) policy tự `EXISTS` trên `members` (đệ quy RLS), (c) thêm tham số tuỳ chọn vào `withWorkspace` (dễ quên).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11/2026: đồng ý khuyến nghị kèm bổ sung ở mục "Điểm chưa rõ").

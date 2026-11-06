# Kế hoạch `feat-auth-harden-4b` — UNIQUE(user_id) cho two_factors, test tự seed, docs/10 §3.1

## Việc

Mã gap matrix: `AUTH-HARDEN-4` mục (3), (5), (7) · Spec: `docs/10_Database_Design.md` §3.1, FR-001.

**Tóm tắt:** Mỗi người dùng chỉ được có đúng một dòng 2FA (bí mật TOTP — mã xác thực 6 số). Hiện chỉ có chỉ mục thường nên hai thao tác bật 2FA chạy song song có thể tạo 2 dòng, khiến người dùng đăng nhập bằng secret không còn đúng. Thêm ràng buộc `UNIQUE(user_id)` (migration 0035), cho test `auth-rls` tự chèn dữ liệu thay vì dựa vào test trước, và ghi ràng buộc vào `docs/10` §3.1. Rủi ro: migration thất bại nếu môi trường đã có dòng trùng (cố ý: không tự xóa secret).

## Điểm chưa rõ

Không có. Quyết định Q-AH4b ghi ở `QUYET_DINH_CHO_DUYET.md`.

## Tiêu chí nghiệm thu

1. Chèn dòng `two_factors` thứ hai cho cùng `user_id` bị từ chối (mã 23505) — kiểm bằng `CF_LANE=b pnpm test:db` (auth-rls).
2. Test `two_factors: cf_auth …` chạy đúng khi chạy riêng (tự seed) — kiểm bằng `vitest -t` chỉ test đó.
3. Plugin 2FA vẫn bật/tắt/tạo lại được (bật lại không tạo dòng thứ hai) — kiểm bằng `packages/saas-core/tests/two-factor.int.test.ts`.
4. `check-rls` xanh, snapshot/journal drizzle khớp schema — `pnpm db:check-rls`, `drizzle-kit generate` không sinh thay đổi mới.
5. `docs/10` §3.1 và §4 nêu `UNIQUE(user_id)` — đọc diff.

## File sẽ đọc

`docs/10_Database_Design.md` (§3.1, §4), `packages/db/src/schema/core/auth.ts`, `packages/db/tests/auth-rls.int.test.ts`, `migrations/0013`, `0014`, `packages/saas-core/tests/two-factor.int.test.ts`.

## File sẽ sửa / tạo

- `packages/db/src/schema/core/auth.ts` — thay index thường bằng unique.
- `packages/db/migrations/0035_two_factors_user_unique.sql` + `meta/*` — migration.
- `packages/db/tests/auth-rls.int.test.ts` — tự seed + test trùng.
- `docs/10_Database_Design.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/codemap.md` (nếu cần), `docs/handoff/feat-auth-harden-4b.md`, `docs/testing/KIEM_TRA_TAY.md` (nếu cần).

## Migration

`0035_two_factors_user_unique`: kiểm trùng (RAISE EXCEPTION rõ ràng nếu có), thêm `UNIQUE (user_id)`, bỏ `two_factors_user_id_idx` (thừa). Lùi: `ALTER TABLE core.two_factors DROP CONSTRAINT two_factors_user_id_unique; CREATE INDEX two_factors_user_id_idx ON core.two_factors (user_id);`.

## Test viết trước

Test trùng `user_id` (đỏ trước migration) và test tự seed.

## Lệnh test phạm vi hẹp

`CF_LANE=b pnpm --filter @flow/db exec vitest run tests/auth-rls.int.test.ts` (và config int nếu có); `pnpm test:db`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration) + `verifier-security` (bảng chứa secret 2FA).

## Rủi ro / câu hỏi cho chủ dự án

Race của plugin: lần bật thứ hai song song sẽ lỗi 23505 (người dùng thử lại) thay vì tạo dòng thừa — chấp nhận.

## Đề xuất thay đổi

Sửa `docs/10` §3.1 dòng `two_factors` và §4 (ghi UNIQUE) — theo Quy tắc hỏi.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong ADR 004 §4 và gap matrix AUTH-HARDEN-4; Q-AH4b).

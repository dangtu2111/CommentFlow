# Kế hoạch `feat-admin-shell-db` — ADMIN-SHELL phần DB (phiên quản trị 8 giờ + nhật ký thao tác Admin)

Mã gap matrix: `ADMIN-SHELL` (phần DB) · Spec: FR-100 khung, FR-118; `AUTH-ADMIN-SESSION` (docs/13 §2, §3.2; docs/10 §4 "Phiên Admin").

**Tóm tắt:** Khung Admin cần (1) kiểm "phiên quản trị còn hiệu lực" ngay trong DB (8 giờ, đã có trigger ép hạn nhưng chưa có hàm kiểm theo phiên), và (2) bảng nhật ký thao tác Admin chỉ-thêm, không sửa/xóa được, chỉ Super Admin đọc (docs/13 §3.2). Làm: lõi thuần ở `@flow/shared`, migration 0061 (bảng + hàm DEFINER), lớp truy vấn ở `@flow/db`, test thường + property-based + tích hợp RLS. Chưa làm giao diện/middleware. Rủi ro: role LOGIN riêng `cf_admin` cần quyền tạo role ở hạ tầng nên hoãn (xem Q-ADSH1).

## Điểm chưa rõ

Không có. (Role DB riêng: tự chọn phương án an toàn — Q-ADSH1.)

## Tiêu chí nghiệm thu

1. `evaluateAdminSession` đúng ≤ 8 giờ, hết hạn, không phải phiên Admin, mốc lạ → không hợp lệ — `pnpm --filter @flow/shared exec vitest run src/admin-audit.test.ts` (ca biên + property-based).
2. `parseAdminAuditInput` che PII/token trong `detail`, chặn khóa nhạy cảm, giới hạn kích thước — cùng file test.
3. Bảng `core.admin_audit_log` chỉ thêm: UPDATE/DELETE/TRUNCATE bị trigger chặn kể cả chủ bảng; `cf_app`/`cf_worker`/`cf_auth` không có quyền trực tiếp — `admin-audit.int.test.ts`.
4. `core.record_admin_action` chỉ cho Admin có phiên Admin còn hạn; người thường, Owner, worker, ngữ cảnh workspace, phiên hết hạn/phiên của người khác/phiên thường → bị từ chối; vai trò + người thực hiện lấy từ DB, không từ tham số — int test.
5. `core.admin_list_audit` chỉ Super Admin (support/finance → 42501) — int test.
6. `pnpm db:check-rls` đạt (bảng Admin-only mới + hàm DEFINER mới) — `check-rls` + test đơn vị.
7. Coverage `@flow/shared` giữ ngưỡng; `pnpm precheck` xanh.

## File sẽ đọc

`docs/codemap.md` (đã), `packages/db/migrations/0059`, `0060` (mẫu hàm DEFINER), `packages/db/src/check-rls.ts` (+ test) (khai báo bảng/hàm), `packages/shared/src/integration-health.ts` (mẫu thuần), `packages/db/src/queries/integration-health.ts` (mẫu lớp truy vấn), `packages/db/tests/integration-health.int.test.ts` (mẫu test).

## File sẽ sửa / tạo

- `packages/shared/src/admin-audit.ts` (+ `.test.ts`), `index.ts` export — lõi thuần.
- `packages/db/migrations/0061_admin_shell.sql` (+ `meta/_journal.json`, snapshot nếu repo có) — bảng + hàm.
- `packages/db/src/schema/core/admin-audit.ts` + `schema/core/index.ts` — khai báo bảng Drizzle.
- `packages/db/src/queries/admin-audit.ts` — `checkAdminSession`, `recordAdminAction`, `listAdminAudit`.
- `packages/db/src/check-rls.ts` (+ test) — khai báo bảng Admin-only + hàm.
- `packages/db/tests/admin-audit.int.test.ts`.
- Docs: `docs/plans/quyet-dinh/qadsh1.md`, `docs/codemap.d/mien-admin-shell-db.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-adsh.md`, `docs/can-ban-cung-cap.d/<mã>.md`, `docs/10_Database_Design.md` (mục phiên Admin/nhật ký), dòng `ADMIN-SHELL` ở `MASTER.md`/`gap-matrix.md`, `docs/handoff/feat-admin-shell-db.md`.

## Migration

`0061_admin_shell.sql`: bảng `core.admin_audit_log` (RLS bật, không policy, thu hồi mọi quyền; trigger chặn UPDATE/DELETE/TRUNCATE); hàm DEFINER `core.require_admin_session`, `core.admin_session_status`, `core.record_admin_action`, `core.admin_list_audit`. Đường lùi: DROP 4 hàm + bảng + trigger function; lùi `check-rls.ts`; mất nhật ký đã ghi (chỉ dùng khi chưa có dữ liệu thật).

## Test viết trước

`admin-audit.test.ts` (thuần, + fast-check), `admin-audit.int.test.ts` (DB thật, RLS/vai trò/phiên). Viết đỏ trước mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/admin-audit.test.ts` · `CF_LANE=b pnpm test:db` (file `admin-audit.int.test.ts`) · `pnpm db:check-rls` · `pnpm --filter @flow/shared test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` (phiên/auth Admin, RLS) và `verifier-db` (migration), mỗi cái một lần ở cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Role LOGIN `cf_admin` (tách hẳn web) cần superuser tạo — mục trong `CAN_BAN_CUNG_CAP`. Đồng hồ máy ảo lệch có thể làm test phiên đỏ (đã ghi ở codemap).

## Đề xuất thay đổi

Cập nhật docs/10 §4 mô tả bảng nhật ký Admin (làm cùng nhánh, ghi trong Q-ADSH1).

## Complexity tracking

Không có (không thêm thư viện; hàm DEFINER theo mẫu 0059/0060).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — bảng `admin_audit_log`: không policy, không quyền trực tiếp; ghi chỉ qua hàm DEFINER theo vai trò Admin (không `workspace_id`)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-ADSH1).

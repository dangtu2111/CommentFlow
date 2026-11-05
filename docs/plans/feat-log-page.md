# Kế hoạch `feat/log-page` — Trang Nhật ký

Mã gap matrix: `LOG-PAGE` · Spec: FR-092 (docs/05), bảng `action_logs` (docs/10), docs/13 §3 (ma trận quyền), bố cục `design/stitch/activity-log.png`.

**Tóm tắt:** thêm trang "Nhật ký hoạt động" (`/app/activity`) đọc thẳng từ bảng `action_logs` (chỉ đọc): danh sách theo thời gian, lọc theo loại tác nhân / hành động / khoảng ngày, bấm một dòng để xem chi tiết giá trị trước → sau. Owner thấy mọi dòng của workspace; Staff chỉ thấy dòng do chính mình thực hiện. Rủi ro: quyền "Staff chỉ của mình" hiện chỉ được ép ở lớp truy vấn (RLS của `action_logs` cho mọi thành viên đọc cả workspace) — xem Rủi ro.

## Điểm chưa rõ

Không có thẻ chặn code. Hai điểm ghi nhận (quyết định tạm theo spec, báo chủ dự án):
- Quyết định: FR-092 ("Staff chỉ thấy của mình") và docs/13 §3 dòng "Nhật ký: Staff ❌" mâu thuẫn. Làm theo FR-092 (Staff thấy dòng của mình). Nếu chủ dự án chọn "Staff không thấy gì" chỉ cần đổi `roles` trong `lib/app-nav.ts` và `role` ở trang.
- Quyết định: không làm thẻ số liệu tổng hợp, "Xuất file Audit", "Lưu trữ 30 ngày", "Tự làm mới", "Meta Graph trace", "Quy tắc kích hoạt" của mock (cần dữ liệu/tính năng chưa có; không bịa số). Có thể làm sau.

## Tiêu chí nghiệm thu

1. Owner thấy mọi dòng `action_logs` của workspace, mới nhất trước; không thấy workspace khác — kiểm bằng: `packages/db/tests/action-logs.int.test.ts`.
2. Staff chỉ thấy dòng `actor_type='user'` và `actor_id` = chính mình, kể cả khi tự đặt bộ lọc tác nhân khác hoặc mở trực tiếp id dòng người khác (trả không thấy) — kiểm bằng: cùng file test.
3. Lọc theo loại tác nhân, hành động, khoảng ngày (theo múi giờ workspace) và phân trang con trỏ không mất/trùng dòng — kiểm bằng: cùng file test + `apps/web/src/lib/action-log-filters.test.ts`.
4. Chi tiết hiển thị trước/sau dạng danh sách khóa → giá trị, không hiển thị nội dung bình luận/PII (log vốn không chứa) — kiểm bằng: `action-log-format.test.ts` + bước KT.
5. Mục "Nhật ký" có trong điều hướng cho Owner và Staff; trang qua `requireAppUser` — kiểm bằng: `app-nav.test.ts`, `require-app-user.scan.test.ts`.
6. Mọi chuỗi chữ qua next-intl (vi + en) — kiểm bằng: `pnpm lint:i18n`.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `packages/db/src/queries/inbox.ts` (mẫu truy vấn + con trỏ), `apps/web/src/lib/inbox-filters.ts` (mẫu tham số URL), `apps/web/src/server/inbox.ts`, `app/app/(guarded)/comments/page.tsx`, `lib/app-nav.ts`, `components/comments/inbox-toolbar.tsx`, `packages/db/src/schema/core/platform.ts` (cột), migration 0001/0016/0010 (RLS `action_logs`, `users`).

## File sẽ sửa / tạo

- `packages/db/src/queries/action-logs.ts` (mới) + export ở `runtime.ts`: `listActionLogs`, `getActionLog`, `listActionLogActions`.
- `packages/db/tests/action-logs.int.test.ts` (mới).
- `apps/web/src/lib/action-log-filters.ts`, `action-log-format.ts` (+ test): tham số URL, dựng đường dẫn, biến before/after thành danh sách.
- `apps/web/src/server/action-log.ts`: nạp dữ liệu trong `withActor`.
- `apps/web/src/app/app/(guarded)/activity/page.tsx`, `components/activity/*`, CSS trong `globals.css`.
- `lib/app-nav.ts` (+ test), `messages/{vi,en}.json`.
- docs: codemap, gap-matrix, MASTER, KIEM_TRA_TAY.

## Migration

Không có. Không đổi RLS/index (đã có index `(workspace_id, created_at)`).

## Test viết trước

Test tích hợp truy vấn (Owner/Staff/chéo workspace/lọc/phân trang) và test đơn vị parse/format — viết trước khi code.

## Lệnh test phạm vi hẹp

`CF_LANE=c pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/action-logs.int.test.ts` (theo script `test:db`), `pnpm --filter @flow/web exec vitest run src/lib`.

## Cần kiểm chứng độc lập không?

Có thể: trang đọc dữ liệu phân quyền theo vai trò. Quy tắc Staff-chỉ-của-mình nằm trong truy vấn (một chỗ, có test); không đổi RLS. Đề xuất kiểm chứng nhẹ `verifier-security` nếu chủ dự án muốn; agent làn này tự kiểm bằng test chéo.

## Rủi ro / câu hỏi cho chủ dự án

- RLS `action_logs_select` chỉ theo workspace: Staff truy vấn trực tiếp DB (ngoài trang) vẫn đọc được log cả workspace. Muốn ép ở DB cần migration (policy SELECT: Owner hoặc `actor_id = current_user_id()`), thuộc lượt migration sau — xin chủ dự án duyệt.
- Tên người thực hiện lấy từ `users` (RLS chỉ cho đọc thành viên `active`); người đã gỡ hiển thị "Thành viên cũ".

## Đề xuất thay đổi

Sửa docs/13 §3 dòng "Nhật ký" thành "Owner: tất cả; Staff: của mình" cho khớp FR-092 (nếu chủ dự án đồng ý).

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

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong FR-092/ADR; không còn thẻ chưa rõ).

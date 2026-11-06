# Kế hoạch `feat-workspace-delete` — Xóa workspace nhiều bước

## Việc

Mã gap matrix: `WORKSPACE-DELETE` · Spec: FR-094, US-071 (docs/05, docs/04); `DB-MAINTENANCE-ROLE` phần xóa workspace.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Cho Owner xóa vĩnh viễn workspace qua 2 bước xác nhận (yêu cầu, rồi gõ lại đúng mã workspace), sau đó chờ 7 ngày (Owner nào cũng hủy được) rồi một job nền xóa toàn bộ dữ liệu; chỉ còn lại một dòng nhật ký tối thiểu. Làm vì hiện không ai xóa được workspace (`cf_app` không có DELETE). Rủi ro: xóa là không hoàn tác — nên job nằm sau cờ `WORKSPACE_DELETE_ENABLED` mặc định TẮT và chưa nối giao diện.

## Điểm chưa rõ

Không có. Thời gian chờ 7 ngày/cửa sổ xác nhận 15 phút chưa có số trong spec → tự chọn phương án an toàn, ghi `docs/plans/quyet-dinh/qwsd1.md` (Q-WSD1).

## Tiêu chí nghiệm thu

1. Chỉ Owner yêu cầu/xác nhận/hủy được; Staff, người ngoài, ngữ cảnh không người dùng, và Owner workspace khác → bị từ chối (42501); request id của workspace khác → CF404 — kiểm bằng `workspace-deletion.int.test.ts` (RLS, chéo workspace).
2. Bước 2 chỉ lên lịch khi CHÍNH người làm bước 1 gõ đúng slug trong 15 phút; sai/hết hạn/người khác không đổi gì — kiểm bằng test tích hợp + `workspace-deletion.test.ts`.
3. Sau xác nhận có 7 ngày chờ; trong thời gian đó hủy được, và yêu cầu đã hủy/chưa tới hạn KHÔNG bao giờ bị xóa — kiểm bằng test tích hợp (`not_due`, `not_scheduled`).
4. Job (`cf_worker`, `withJob`) xóa workspace và mọi dữ liệu (cascade), không đụng workspace khác, giữ dòng nhật ký tối thiểu (`completed`, số thành viên), chạy lại idempotent — kiểm bằng test tích hợp.
5. `cf_app` không ghi trực tiếp bảng yêu cầu, không gọi hàm của worker; `pnpm db:check-rls` đạt — kiểm bằng test tích hợp + `check-rls.test.ts`/`check-rls.int.test.ts`.
6. Job worker không làm gì khi cờ TẮT (mặc định); lỗi một workspace không chặn workspace khác, log không lộ nội dung — kiểm bằng `jobs/workspace-deletion.test.ts` + `config.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

- `packages/db/migrations/0053_retention_job.sql`, `0054_plans_subscriptions.sql`, `0028_member_leave.sql`: mẫu hàm DEFINER cho worker/Owner.
- `packages/db/src/check-rls.ts` (các đoạn plan/invoice/no-delete): thêm kiểm bảng + hàm mới.
- `apps/worker/src/jobs/retention.ts`, `config.ts`, `main.ts`: mẫu job + cờ.
- `packages/db/tests/plans.int.test.ts`, `helpers.ts`: mẫu test tích hợp.

## File sẽ sửa / tạo

- Tạo: `packages/shared/src/workspace-deletion.ts` (+ test), `packages/db/src/schema/core/workspace-deletion.ts`, `packages/db/migrations/0055_workspace_deletion.sql` (+ snapshot), `packages/db/src/workspace-deletion.ts`, `packages/db/tests/workspace-deletion.int.test.ts`, `apps/worker/src/jobs/workspace-deletion.ts` (+ test).
- Sửa: `packages/shared/src/index.ts`, `packages/db/src/{runtime,check-rls,check-rls.test}.ts`, `packages/db/src/schema/core/index.ts`, `apps/worker/src/{config,config.test,main}.ts`, `env.example`.
- Docs: file riêng ở `docs/codemap.d/`, `docs/plans/quyet-dinh/`, `docs/can-ban-cung-cap.d/`, `docs/testing/kiem-tra-tay.d/`; dòng gap-matrix/MASTER của việc.

## Migration

`0055_workspace_deletion.sql`: bảng `core.workspace_deletion_requests` (RLS, cf_app chỉ SELECT, không FK) + 5 hàm DEFINER (3 Owner/cf_app, 2 cf_worker). Đường lùi ghi đầu file migration (DROP hàm + bảng + lùi check-rls); workspace đã xóa không phục hồi.

## Test viết trước

Logic thuần (`matchesDeletionConfirmation`, `deletionPhase`, hằng số) và cờ/job worker có test đi cùng; hành vi quyền/RLS/cascade kiểm bằng test tích hợp DB thật.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/workspace-deletion.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/workspace-deletion.test.ts src/config.test.ts` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/workspace-deletion.int.test.ts tests/check-rls.int.test.ts` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration/RLS/hàm DEFINER) và `verifier-security` (phân quyền Owner, xóa dữ liệu) một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Xóa không hoàn tác: cờ TẮT, chưa nối UI. Việc sau: nối giao diện, thu hồi webhook/token Meta, email báo, bắt buộc xuất dữ liệu trước khi xóa (`DATA-EXPORT`).

## Đề xuất thay đổi

Không đổi docs/01–16. Chủ dự án xem Q-WSD1 (7 ngày/15 phút).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": bảng mới không có policy GHI (ghi qua hàm DEFINER: Owner dùng `withActor` + `is_workspace_owner()`, worker dùng `withJob`); SELECT cho Owner hoặc hệ thống

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi Q-WSD1).

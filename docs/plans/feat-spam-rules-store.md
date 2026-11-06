# Kế hoạch `feat-spam-rules-store` — SPAM-RULES-STORE (bảng `rules` + lưu quy tắc spam)

Mã gap matrix: `SPAM-RULES-DB` (dòng `SPAM-RULES`) · Spec: FR-080, US-050, UF-4; `docs/10_Database_Design.md` §3.5 (`rules`).

**Tóm tắt:** Tạo bảng `cf.rules` (quy tắc spam theo workspace, có RLS — chỉ Owner/hệ thống ghi) và nối nút "Lưu" của trang `/app/spam-rules` vào bảng đó (hiện đang trả "chưa khả dụng"). Xem trước 7 ngày đã có sẵn từ `feat-spam-rules` nên không đổi. Rủi ro: quy tắc là dữ liệu do người dùng nhập (regex) — DB chỉ lưu, không chạy; việc chạy quy tắc trên bình luận mới là việc sau (có `shadow_until`). Hành động chỉ `mark`/`skip`, DB từ chối `auto_hide` (AI/quy tắc không tự ẩn).

## Điểm chưa rõ

Không có (tự chọn phương án khuyến nghị, ghi Q-SRS1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Owner lưu được quy tắc; đọc lại đúng từng trường; `enabled` mặc định bật — kiểm bằng `packages/db/tests/spam-rules.int.test.ts`.
2. Staff, người ngoài, `withWorkspace` trần ghi bị RLS chặn (42501); workspace khác không đọc thấy chéo — cùng test.
3. DB từ chối `action='auto_hide'`, loại sai, tên rỗng/quá dài, mẫu > 200, loại không-mẫu mà có mẫu (23514) — cùng test.
4. `created_by` của Owner buộc = chính người ghi; hệ thống buộc null — cùng test + `pnpm db:check-rls`.
5. Tối đa 50 quy tắc/workspace (quy tắc thứ 51 bị từ chối bằng lỗi rõ) — cùng test.
6. Bật/tắt và xóa quy tắc chỉ Owner; liệt kê theo thứ tự tạo — cùng test.
7. Trang lưu: `save` gọi kho trong `withActor` với `userId`, trả `ok`; lỗi kho → `unavailable`; không ghi khi sai dữ liệu — `apps/web/src/server/spam-rules.test.ts`.
8. Lint, typecheck, depcruise, check:plans, check-rls xanh.

## File sẽ đọc

`docs/10_Database_Design.md` §rules (đã đọc), `apps/web/src/server/spam-rules.ts` (+test), `packages/db/src/queries/automation-settings.ts` + `schema/cf/automation.ts` + migration 0047/0048 (mẫu RLS), `check-rls.ts` (kỳ vọng), `packages/db/tests/automation-settings.int.test.ts` (mẫu test).

## File sẽ sửa / tạo

- `packages/db/src/schema/cf/spam-rules.ts` (mới) + `index.ts` — schema Drizzle `cf.rules`.
- `packages/db/migrations/0050_spam_rules_store.sql` + `meta/*` — bảng, CHECK, RLS, GRANT.
- `packages/db/src/queries/spam-rules.ts` (mới), `runtime.ts` — `createSpamRule`/`listSpamRules`/`setSpamRuleEnabled`/`deleteSpamRule`.
- `packages/db/src/check-rls.ts` — kỳ vọng RLS cho `cf.rules`.
- `packages/db/tests/spam-rules.int.test.ts` (mới).
- `apps/web/src/server/spam-rules.ts` (+test) — kho DB nối vào `save`.
- `docs/10_Database_Design.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-spam-rules-store.md`.

## Migration

`0050_spam_rules_store` (số kế tiếp sau 0049 trên main). Tạo `cf.rules` (id, workspace_id FK cascade, name, type, pattern, action, enabled, shadow_until, created_by FK set null, created_at, updated_at), CHECK, RLS (đọc: thành viên/không người dùng; ghi: Owner hoặc hệ thống), GRANT theo cột. Không có `rule_matches` (thuộc việc chạy quy tắc sau). Đường lùi: `DROP TABLE cf.rules` + bỏ kỳ vọng ở check-rls.ts; web về `unavailable`.

## Test viết trước

Int test DB (RLS/CHECK/cap) và unit test `save` truyền `userId` — viết trước khi code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/server/spam-rules.test.ts`; `CF_LANE=b pnpm test:db` (tệp spam-rules); `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration + RLS) và `verifier-security` (RLS ghi theo vai trò, regex do người dùng nhập).

## Rủi ro / câu hỏi cho chủ dự án

Chưa có chỗ chạy quy tắc trên bình luận mới; lưu rồi chưa có tác dụng cho đến việc nối pipeline.

## Đề xuất thay đổi

Cập nhật docs/10: `rules` thực tế có `id`, `created_by`, `created_at`, `updated_at`; action CHECK chỉ `mark`/`skip` cho đến AUTO-HIDE.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; Q-SRS1).

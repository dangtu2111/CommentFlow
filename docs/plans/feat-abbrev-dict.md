# Kế hoạch `feat-abbrev-dict` — ABBREV-DICT (từ điển viết tắt hệ thống + workspace)

Mã gap matrix: `ABBREV-DICT` (MASTER) · Spec: FR-025, FR-050 (mục "Từ điển viết tắt"), `docs/10` §3.4 `abbreviations`, §9 (seed), `docs/11` `/kb/abbreviations`, `docs/09` §5 quy tắc 2.

**Tóm tắt:** Thêm từ điển viết tắt ("ib" → "inbox", "sz" → "size"…) để bước chuẩn hóa văn bản hiểu teencode: một bảng chung do hệ thống seed (mọi shop dùng chung, không ai sửa được qua ứng dụng) và một bảng riêng của từng workspace (Owner tự thêm/sửa/xóa; mục của shop đè mục hệ thống). Chỉ làm dữ liệu + truy vấn + test RLS chéo; giao diện (`KB-ABBREV-UI`) và nối vào pipeline là việc sau. Rủi ro: thấp (từ điển không chứa PII); migration cần `verifier-db` một lần.

## Điểm chưa rõ

Không có (quyết định tự chọn, ghi `QUYET_DINH_CHO_DUYET.md` mã Q-AD1).

## Tiêu chí nghiệm thu

1. `parseAbbreviation` chuẩn hóa `short` (NFC, thường, cắt khoảng trắng), từ chối `short` rỗng/có khoảng trắng/quá 32 ký tự, `full` rỗng/quá 100 ký tự, `lang` lạ, `short = full` — `packages/shared/src/abbreviation.test.ts` (FR-025, FR-050).
2. `mergeAbbreviations` cho mục workspace đè mục hệ thống cùng `short` — cùng file test (FR-025).
3. Bảng hệ thống `cf.system_abbreviations` đã seed (≥ "ib", "sz", "dc", "k"…), `cf_app` chỉ SELECT (INSERT/UPDATE/DELETE bị từ chối); mọi workspace đọc được cùng một bộ — `packages/db/tests/abbreviations.int.test.ts` + `pnpm db:check-rls`.
4. Bảng `cf.abbreviations` của workspace: Owner tạo/sửa/xóa được; Staff chỉ đọc; người lạ không thấy; `withWorkspace` trần chỉ đọc — int test.
5. Workspace B không đọc/sửa/xóa/ghi được mục của A (INSERT với `workspace_id` của A bị RLS chặn; sửa/xóa id của A → 0 dòng) — int test.
6. Trùng `(workspace, lang, short)` bị từ chối (23505); CHECK chặn `short` có hoa/khoảng trắng — int test.
7. `loadAbbreviationEntries(tx, ws, lang)` trả bản đã trộn (workspace đè hệ thống), đúng ngôn ngữ, không lẫn workspace khác; đưa được vào `createAbbreviationDict` (`packages/ai`) — int test.
8. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test:trace, test:coverage của `shared`, `CF_LANE=b pnpm test:db`, `db:check-rls`.

## File sẽ đọc

Đã đọc: `docs/workflows/{feature,finish}.md`, `STANDARD.md`, `docs/10` mục `abbreviations`, migration `0036` + `0040` (mẫu RLS Owner/hệ thống), `check-rls.ts` (SYSTEM_TABLES, ACTOR_POLICIES), `queries/kb-content.ts`, `schema/cf/kb-content.ts`, `normalize-lang.ts` (interface `AbbreviationDict`), `kb-content.int.test.ts` (mẫu test).

## File sẽ sửa / tạo

- `packages/shared/src/abbreviation.ts` (+ test, export ở `index.ts`) — `parseAbbreviation`, `mergeAbbreviations`, hằng.
- `packages/db/src/schema/cf/abbreviations.ts` (+ export) — `systemAbbreviations`, `abbreviations`.
- `packages/db/migrations/0041_abbreviations.sql` (+ `meta/`) — 2 bảng, RLS, quyền, seed hệ thống.
- `packages/db/src/queries/abbreviations.ts` (+ export ở `runtime.ts`) — tạo/sửa/xóa/liệt kê/`loadAbbreviationEntries`.
- `packages/db/src/check-rls.ts` (+ test) — `system_abbreviations` là bảng hệ thống; policy `abbreviations`; khóa cột.
- `packages/db/tests/abbreviations.int.test.ts` — tích hợp.
- `docs/10` (tách hai bảng), `QUYET_DINH_CHO_DUYET.md`, `KIEM_TRA_TAY.md`, `codemap.md`, `gap-matrix.md`, `MASTER.md`, `docs/handoff/feat-abbrev-dict.md`.

## Migration

`0041_abbreviations.sql` (làn b): `cf.system_abbreviations` (không RLS, cf_app chỉ SELECT, seed) và `cf.abbreviations` (workspace_id NOT NULL, RLS: đọc thành viên; ghi Owner/hệ thống). Đường lùi: `DROP TABLE cf.abbreviations, cf.system_abbreviations;` + lùi `check-rls.ts`.

## Test viết trước

`abbreviation.test.ts` chạy ĐỎ trước `abbreviation.ts`; `abbreviations.int.test.ts` viết trước migration.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared run test src/abbreviation.test.ts` · `CF_LANE=b pnpm test:db` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

**Có** — migration + RLS (`verifier-db`, một lần). Không chạm auth/token/cổng tự gửi nên bỏ `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Danh sách seed hệ thống do agent soạn (teencode phổ biến) — chủ dự án nên duyệt/bổ sung (xem Q-AD1). Nối vào pipeline: gap `ABBREV-DICT-WIRE`.

## Đề xuất thay đổi

`docs/10`: `abbreviations.workspace_id` (null = hệ thống) tách thành hai bảng.

## Complexity tracking

Đi lệch `docs/10` (một bảng, `workspace_id` null): tách hai bảng vì mọi bảng có `workspace_id` phải thỏa mẫu policy `workspace_id = current_workspace_id()` của `check-rls` — chính sách "hoặc null" làm mở rộng mẫu kiểm RLS. Phương án một bảng đã loại.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

Policy GHI: `abbreviations` — Owner (`withActor`) hoặc hệ thống (`withJob`); Staff/`withWorkspace` trần chỉ đọc. `system_abbreviations` — cf_app không ghi (seed bằng migration).

## Trạng thái duyệt

Đã duyệt (tự duyệt: quyết định ghi ở Q-AD1).

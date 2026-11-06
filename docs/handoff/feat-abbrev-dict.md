# Bàn giao — nhánh `feat-abbrev-dict`

Cập nhật: 2026-11-06 · Mục gap matrix: ABBREV-DICT · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-abbrev-dict.md` · Quyết định: Q-AD1

## Đã làm
- `packages/shared/src/abbreviation.ts` (+ test): `parseAbbreviation` (chuẩn hóa `short`), `mergeAbbreviations` (mục shop đè hệ thống, đối tượng không nguyên mẫu).
- Migration 0041: `cf.system_abbreviations` (không RLS, `cf_app` chỉ SELECT, seed ~55 mục vi/en) + `cf.abbreviations` (RLS: Owner/hệ thống ghi, thành viên đọc; khóa cột `workspace_id`/`lang`).
- `packages/db/src/queries/abbreviations.ts`: tạo/sửa/xóa/liệt kê + `loadAbbreviationEntries` (trả `Record` cho `createAbbreviationDict`). `check-rls.ts`: bảng hệ thống mới + policy + khóa cột.
- `packages/db/tests/abbreviations.int.test.ts` (RLS chéo workspace, vai trò, seed, ghi hệ thống bị chặn).

- verifier-db (một lần): "Chặn merge" — `full` là từ khóa SQL, phải viết `"full"` trong migration/truy vấn/test → đã sửa; thêm `lock_timeout`; ghi chú mục seed mơ hồ (kh, mk, tk, bn, k…) để chủ dự án duyệt. Không còn mục chặn.

## Chưa kiểm được ở làn này
- `CF_LANE=b pnpm test:db` và `pnpm db:check-rls`: lệnh có tiền tố biến môi trường bị chặn phê duyệt trong phiên không tương tác; `db:check-rls` không có `CF_LANE` trỏ DB cũ chưa có role `cf_worker`. Cần chạy ở CI/máy có quyền (kết quả CI là bằng chứng).

## Đã đọc và rút ra
- `check-rls` bắt mọi bảng có `workspace_id` khớp mẫu `workspace_id = current_workspace_id()` → lý do tách hai bảng. Bảng hệ thống khai ở `SYSTEM_TABLES`.
- `db` không import `ai` (depcruise): từ điển trả `Record`, ai dựng dict.

## Còn lại
- `ABBREV-DICT-WIRE`: nối `loadAbbreviationEntries(tx, ws, lang)` vào bước chuẩn hóa (chọn ngôn ngữ tra; docs/09 §5 quy tắc 2: trúng viết tắt → `vi`).
- `KB-ABBREV-UI`: giao diện + API `/kb/abbreviations`.
- Chủ dự án duyệt/bổ sung bộ seed (migration mới).

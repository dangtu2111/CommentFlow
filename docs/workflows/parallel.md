# Chạy song song nhiều nhánh (làn)

Một **làn** = một thư mục làm việc `git worktree` + một phiên Claude + (nếu cần DB) một DB test riêng `cf_test_<làn>`. Có **3 làn**: `a`, `b`, `c`. Làn chỉ tách công cụ; quy tắc "một nhánh, một agent" trong `AGENTS.md` vẫn đúng.

## Tạo làn

Từ thư mục repo chính (đã ở `main`, sạch):

```
git fetch origin
git worktree add ../CommentFlow-lane-a -b feat/<tên> origin/main
cd ../CommentFlow-lane-a
corepack enable && pnpm install --frozen-lockfile
```

- Copy `.env` và `.env.local` từ repo chính sang thư mục làn (chủ dự án tự copy; agent không đọc `.env*`).
- Đặt làn cho test tích hợp: `CF_LANE=a pnpm test:db` (biến môi trường cho từng lệnh; hoặc đặt trong cửa sổ terminal của làn). Không đặt `CF_LANE` thì dùng `cf_test` như cũ.
- `CF_LANE` chỉ đổi bốn URL test (`TEST_DATABASE_URL`, `TEST_DATABASE_ADMIN_URL`, `TEST_DATABASE_AUTH_URL`, `TEST_DATABASE_WORKER_URL`) sang `cf_test_<làn>`; `DATABASE_URL` (dev) không đổi. Tên làn: chữ thường/số, tối đa 8 ký tự.
- Lần đầu cho mỗi làn, tạo DB trên máy ảo (idempotent): `pnpm cf:dev sync <nhánh>` rồi `pnpm cf:dev add-test-db a` (cần nhánh chứa script đã có trên origin).
- Dọn làn khi xong: `git worktree remove ../CommentFlow-lane-a` (sau khi nhánh đã merge).

## Phân loại nhánh

| Loại | Đặc điểm | Làn |
|---|---|---|
| Làn DB | Chạy `test:db`, có thể thêm migration | Cần `CF_LANE` và DB `cf_test_<làn>` riêng |
| Giao diện | Chủ yếu `apps/web`, test đơn vị | Không cần DB làn |
| Haiku/cơ học | `mech/*`, việc cơ học kiểm bằng typecheck/test | Không cần DB làn; không đụng migration |

Dev server cổng 3000/3001 chỉ chạy được một cái mỗi lúc; làn thứ hai cần cổng khác.

## Quy tắc migration và file chung

- **Mỗi thời điểm chỉ một nhánh có migration.** Nhánh cần migration báo trước cho chủ dự án; nhánh khác chờ merge hoặc rebase sau.
- `pnpm check:migrations` (chạy ở CI) đỏ khi số migration trùng/không liên tục hoặc không khớp `_journal.json`. Đây là lưới an toàn, không phải khóa.
- File chung dễ xung đột: `docs/gap-matrix.md`, `pnpm-lock.yaml`, `packages/db/src/schema/*`, `packages/db/migrations/meta/*`. Mỗi nhánh chỉ sửa dòng của mình; xung đột thì giải quyết khi rebase, không viết lại cả file. `docs/codemap.md` và `docs/plans/QUYET_DINH_CHO_DUYET.md` KHÔNG còn là file chung: mỗi nhánh thêm file riêng ở `docs/codemap.d/` / `docs/plans/quyet-dinh/` rồi chạy `pnpm codemap:build` / `pnpm quyet:build`; nếu hai file sinh ra xung đột khi merge → chạy lại `build` (không gỡ tay).

## Thứ tự merge và rebase

1. Merge từng nhánh một vào `main` (qua PR, CI xanh).
2. Sau mỗi lần merge, các làn còn lại: `git fetch origin && git rebase origin/main`, chạy lại công cụ phạm vi đã đổi.
3. Nhánh có migration merge **trước**; nhánh khác rebase xong mới kiểm lại `pnpm check:migrations`.
4. Không force-push lên nhánh đã mở PR của người khác; chỉ rebase nhánh của làn mình.

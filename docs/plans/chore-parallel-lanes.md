# Kế hoạch `chore/parallel-lanes` — chạy song song nhiều nhánh mà không giẫm chân nhau

## Việc

Mã gap matrix: (mới) `LANES` · Spec: `docs/workflows/` (quy trình), `AGENTS.md` § Phối hợp nhiều agent, `docs/decisions/002-hai-may.md`.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Hiện chỉ có một DB test `cf_test` và `pnpm test:db` xóa-tạo lại nó mỗi lần chạy, nên hai nhánh chạy test cùng lúc sẽ làm hỏng nhau; số migration cũng dễ trùng khi hai nhánh cùng thêm bảng. Nhánh này cho mỗi "làn" (một thư mục làm việc `git worktree` + một phiên Claude) DB test riêng `cf_test_<làn>`, thêm kiểm tra số migration ở CI, và viết quy tắc chia làn. Rủi ro thấp: chỉ đụng công cụ và tài liệu, không đụng logic nghiệp vụ hay schema.

## Điểm chưa rõ

Quyết định của chủ dự án (đồng ý khuyến nghị):

1. Quyết định: **3 làn** (a, b, c). Agent được tự chạy `pnpm cf:dev add-test-db a|b|c` (chỉ project cf-dev, đã được cho phép).
2. Quyết định: quy tắc "mỗi thời điểm chỉ một nhánh có migration" ghi ở `docs/workflows/parallel.md`; CI chỉ kiểm số migration liên tục, không khóa cứng.
3. Bổ sung: thêm **một dòng vào `AGENTS.md`** § Phối hợp nhiều agent trỏ tới `docs/workflows/parallel.md`.

## Tiêu chí nghiệm thu

1. Đặt `CF_LANE=b` thì mọi tên DB test (`TEST_DATABASE_URL`, `TEST_DATABASE_ADMIN_URL`, `TEST_DATABASE_AUTH_URL`) trỏ tới `cf_test_b`; không đặt `CF_LANE` thì giữ nguyên `cf_test`; tên làn sai định dạng bị từ chối — kiểm bằng: test đơn vị `load-env`.
2. Script chặn migration/xóa-tạo lại schema chấp nhận `cf_test_<làn>` (chữ thường/số, ≤ 8 ký tự) và vẫn từ chối `cf_dev` cho reset, staging/production, tên lạ (`cf_test_`, `cf_testx`, `commentflow`) — kiểm bằng: test đơn vị `migration-guard`.
3. `pnpm cf:dev add-test-db <làn>` chạy script cố định trên máy ảo, idempotent, tạo DB `cf_test_<làn>` với cùng quyền như `cf_test` (cf_app/cf_auth chỉ CONNECT, extension vector/unaccent/pg_trgm/citext), không in bí mật, từ chối tên lạ — kiểm bằng: test đơn vị `cf-dev-command` (đối số hợp lệ/không hợp lệ) + chạy thật một lần trên máy ảo (chủ dự án) rồi `CF_LANE=a pnpm test:db` xanh.
4. Hai làn chạy `test:db` **cùng lúc** (`CF_LANE=a` và `CF_LANE=b`) đều xanh, không làm hỏng nhau — kiểm bằng: chạy tay hai cửa sổ (chủ dự án) hoặc `/finish` ghi kết quả.
5. `pnpm check:migrations` đỏ khi: số thứ tự trùng/không liên tục, file `.sql` không có trong `_journal.json` (hoặc ngược lại), tag không khớp tên file; xanh trên repo hiện tại; chạy ở CI — kiểm bằng: test đơn vị + bước mới trong `ci.yml`.
6. `docs/workflows/parallel.md` mô tả: tạo làn (`git worktree add`, `pnpm install`, copy `.env`, đặt `CF_LANE`), phân loại nhánh (làn DB / giao diện / Haiku), quy tắc migration và file chung, thứ tự merge-rebase; `AGENTS.md` và `docs/codemap.md` có dòng trỏ tới — kiểm bằng: đọc + `pnpm check:plans`.
7. Công cụ xanh: `pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise && pnpm check:plans`.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `scripts/lib/load-env.mjs` — thêm suy ra tên DB theo `CF_LANE`.
2. `packages/db/src/migration-guard.ts` (+ `.test.ts`) — nới danh sách DB cho phép theo mẫu làn.
3. `scripts/lib/cf-dev-command.mjs` (+ test) — thêm lệnh `add-test-db`.
4. `infra/scripts/cf-dev-add-auth-role.sh` + `infra/postgres/init/10-roles-and-databases.sh` — mẫu tạo DB/quyền để viết script mới đúng quyền.
5. `packages/db/migrations/meta/_journal.json` — định dạng cho `check:migrations`.
6. `.github/workflows/ci.yml`, `package.json` — thêm bước CI và script.
7. `docs/workflows/finish.md`, `AGENTS.md` mục "Phối hợp nhiều agent" — chỗ trỏ tới quy trình song song.

## File sẽ sửa / tạo

- `scripts/lib/load-env.mjs` (+ `load-env.test.mjs`) — `CF_LANE` → đổi `/cf_test` thành `/cf_test_<làn>` trong ba URL test (không đụng URL dev).
- `packages/db/src/migration-guard.ts` (+ test) — `cf_test_<làn>` hợp lệ cho migrate và reset.
- `infra/scripts/cf-dev-add-test-db.sh` (mới) — tạo DB làn trên máy ảo (idempotent, chỉ project cf-dev, không in bí mật).
- `scripts/lib/cf-dev-command.mjs` (+ test) — `add-test-db <làn>`.
- `scripts/check-migrations.mjs` + `scripts/lib/migrations-check.mjs` (+ test), `package.json` (`check:migrations`), `.github/workflows/ci.yml` — cổng số migration.
- `docs/workflows/parallel.md` (mới), `AGENTS.md` (một dòng trỏ tới), `docs/codemap.md`, `docs/gap-matrix.md` (dòng `LANES`), `env.example` (ghi chú `CF_LANE`).

## Migration

Không có.

## Test viết trước

- `load-env`: `CF_LANE` hợp lệ/không đặt/sai định dạng; không động tới `DATABASE_URL` (dev).
- `migration-guard`: bảng tên DB cho migrate/reset (cf_test, cf_test_b, cf_ci cho phép; cf_dev reset, cf_test_, cf_testx, tên dài, staging bị từ chối).
- `migrations-check`: journal liên tục, trùng số, file thiếu/thừa.
- `cf-dev-command`: `add-test-db b` hợp lệ; thiếu/thừa đối số, ký tự lạ bị từ chối.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/scripts test
pnpm --filter @flow/db exec vitest run src/migration-guard.test.ts
pnpm check:migrations
pnpm lint && pnpm typecheck && pnpm depcruise && pnpm check:plans
```
Kiểm hai làn chạy song song cần máy ảo bật và `cf:dev add-test-db` đã chạy.

## Cần kiểm chứng độc lập không?

**Không.** Không chạm auth/RLS/migration schema; chỉ công cụ chạy trên DB test và tài liệu. Chặn chạy nhầm DB vẫn do `migration-guard` (có test); script máy ảo chỉ cố định tên làn đã kiểm regex.

## Rủi ro / câu hỏi cho chủ dự án

- **Lệnh máy ảo:** `pnpm cf:dev add-test-db <làn>` ghi vào Postgres `cf-dev` (tạo DB). Tôi chỉ viết script, **bạn chạy** lần đầu cho a, b, c (agent không tự chạy lệnh ghi lên máy ảo ngoài phạm vi đã cấp).
- RAM/CPU máy ảo: 3 DB test không đáng kể; 3 phiên Claude + 3 `pnpm test:db` đồng thời tốn CPU máy ảo — nếu chậm, giảm còn 2 làn.
- Tệp `.env` mỗi worktree: bạn tự copy (tôi không đọc `.env*`).

## Đề xuất thay đổi

- `AGENTS.md` § Phối hợp nhiều agent: thêm một dòng "Chạy song song nhiều nhánh: xem `docs/workflows/parallel.md` (mỗi làn một worktree + `CF_LANE`)". Cần bạn đồng ý vì là file hướng dẫn chung.
- `docs/decisions/002-hai-may.md`: không sửa; ghi quy tắc làn ở `parallel.md`.

## Complexity tracking

Không có (không thêm thư viện, không thêm tầng trừu tượng; script và quy tắc nhỏ).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11/2026: đồng ý khuyến nghị kèm bổ sung ở mục "Điểm chưa rõ").

# Kế hoạch `feat/db-bootstrap` — DB-BOOTSTRAP: kiểm tiền đề (extension, role) trước khi áp migration

## Việc

Mã gap matrix: DB-BOOTSTRAP (Phần 4e, thứ tự chủ dự án 12/11/2026; chủ dự án dự kiến "migration chỉ-thêm, tự kiểm, tự merge" — tôi chọn KHÔNG migration, xem `docs/plans/quyet-dinh/q-db-bootstrap.md`).

**Tóm tắt (2–3 câu dễ hiểu):** Migration 0000 cần sẵn extension `citext` (và `unaccent`, `pg_trgm`, `vector` ở các migration sau) cùng các role `cf_owner/cf_app/cf_auth/cf_worker`, nhưng chỉ script khởi tạo Docker dựng chúng. DB staging/production tạo bằng cách khác thì migration lỗi khó đọc giữa chừng. Nay trước khi áp migration, hệ thống kiểm các tiền đề này: tự cài extension cài được, còn thiếu thì dừng với thông báo tiếng Việt nêu đúng thiếu gì và lệnh xử lý.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. `evaluateBootstrap` phân biệt "cài được" / "máy chủ không có gói" / "thiếu role"; thông báo nêu tên và lệnh, KHÔNG có mật khẩu/chuỗi kết nối.
2. `ensureBootstrap`: đủ → không làm gì; cài được và có quyền → `CREATE EXTENSION IF NOT EXISTS`; thiếu quyền/thiếu gói/thiếu role → ném thông điệp rõ (không lộ lỗi gốc).
3. `runMigrations` và `runStagingMigrate` (áp thật) gọi kiểm trước khi `migrate`; dry-run staging chỉ đọc và báo.
4. Test trên `cf_test` thật: đủ tiền đề, kiểm qua; test staging-migrate cũ vẫn xanh.

## File sẽ đọc / sửa

Thêm: `packages/db/src/bootstrap-check.ts` (+test, +`tests/bootstrap.int.test.ts`). Sửa: `packages/db/src/admin.ts`, `packages/db/src/staging-migrate.ts`, `docs/gap-matrix.md`.

## Migration

Không (Q-DB-BOOTSTRAP).

## Test viết trước

`bootstrap-check.test.ts` (10 ca), `bootstrap.int.test.ts` (2 ca), chạy lại `staging-migrate.int.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run src/bootstrap-check.test.ts` · `pnpm --filter @flow/db test:db tests/bootstrap.int.test.ts tests/staging-migrate.int.test.ts`.

## Cần kiểm chứng độc lập không?

Có chạm đường migrate nhưng KHÔNG đổi schema/RLS/dữ liệu: chỉ đọc catalog và (nếu thiếu và có quyền) `CREATE EXTENSION IF NOT EXISTS` trong danh sách cố định; chạy trước khi migrate. Tôi tự kiểm theo `docs/workflows/verify.md` mục B (database): không thêm bảng/RLS; không khóa bảng; không đụng dữ liệu → "tự kiểm, chưa có kiểm chứng độc lập"; không thuộc diện DỪNG (không DROP/RENAME/đổi kiểu/nới RLS).

## Rủi ro / câu hỏi cho chủ dự án

`CREATE EXTENSION` tự chạy ở `runMigrations` (dev/test/ci) và áp thật staging khi thiếu extension cài được; staging cần role đủ quyền — nếu không, dừng với lệnh để chủ dự án chạy (đúng nguyên tắc staging chỉ qua CI có duyệt).

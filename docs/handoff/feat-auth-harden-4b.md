# Bàn giao `feat-auth-harden-4b` (claude, làn b)

**Đã làm:** schema `two_factors` UNIQUE(user_id) + migration 0035 (kiểm trùng rồi mới ràng buộc, bỏ chỉ mục thừa); test `auth-rls` tự seed + test trùng; `docs/10` §3.1/§4; Q-AH4b; KT-023; gap-matrix/MASTER.
**Đã đọc, rút ra:** 0013/0014 (RLS + GRANT cột cf_auth), `auth-rls.int.test.ts` (test 2 phụ thuộc seed của test 1 → đã sửa).
**Chưa kiểm được:** `pnpm db:migrate`/`test:db` không chạy được trong môi trường làn (DB thiếu role `cf_worker`, vitest int lỗi khởi động) → cần chạy lại trên máy có DB: `CF_LANE=b pnpm test:db`, `pnpm db:check-rls`, `packages/saas-core/tests/two-factor.int.test.ts`.
**Còn lại:** không.

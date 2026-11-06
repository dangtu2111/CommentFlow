## KT-KBS — Bảng kiến thức `kb_*` (KB-SCHEMA, feat/kb-schema, migration 0031)

Điều kiện: nhánh `feat/kb-schema`; máy ảo `cf` bật; `.env` đã có `DATABASE_WORKER_URL`/`TEST_DATABASE_WORKER_URL` (KT-015). Việc này chỉ có bảng, chưa có giao diện.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm db:migrate` (cf_dev). | Áp migration 0031, không lỗi (cần extension `vector` đã có sẵn ở DB dev). |
| 2 | `pnpm db:check-rls`. | 0 vi phạm; có ba bảng `cf.kb_sources`, `cf.kb_versions`, `cf.kb_chunks`. |
| 3 | `CF_LANE=b pnpm test:db`. | Xanh, gồm `kb-schema.int.test.ts`. |
| 4 | Trong `psql` vào `cf_dev`: `SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid='cf.kb_chunks'::regclass AND attname='embedding';` | `halfvec(1024)`. |

Nếu hỏng: ghi số bước và nội dung lỗi (không dán mật khẩu).

---

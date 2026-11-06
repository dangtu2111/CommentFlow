| Migration / kiểm RLS | `pnpm db:migrate` · `pnpm db:check-rls` | cần role `cf_worker` có sẵn (migration 0030); chỉ DB `cf_dev`/`cf_test`/`cf_ci`, `APP_ENV` dev/test/ci |

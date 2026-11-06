// Kiểm RLS trên database trỏ bởi DATABASE_ADMIN_URL (hoặc TEST_DATABASE_ADMIN_URL nếu đặt CHECK_RLS_TEST=1).
import pg from 'pg';
import { checkRls } from '../check-rls';
import { parseCheckRlsEnv } from '../cli-env';

const { url } = parseCheckRlsEnv();
if (!url) {
  console.error('Thiếu DATABASE_ADMIN_URL (hoặc TEST_DATABASE_ADMIN_URL khi CHECK_RLS_TEST=1).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const violations = await checkRls(pool);
  if (violations.length === 0) {
    console.log(
      'check-rls: đạt — mọi bảng có workspace_id đều bật RLS + policy; cf_app đúng quyền.',
    );
  } else {
    for (const v of violations) console.error(`check-rls: ${v.subject}: ${v.message}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}

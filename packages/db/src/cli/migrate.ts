// Áp migration lên DB dev/test/ci bằng DATABASE_ADMIN_URL (role cf_owner). Có chặn môi trường.
import { isAppError } from '@flow/shared';
import { runMigrations } from '../admin';

try {
  await runMigrations({ appEnv: process.env.APP_ENV, adminUrl: process.env.DATABASE_ADMIN_URL });
  console.log('Migration đã áp xong.');
} catch (error) {
  console.error(isAppError(error) ? `[${error.code}] ${error.message}` : error);
  process.exit(1);
}

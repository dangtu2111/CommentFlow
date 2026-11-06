// Xoá và tạo lại schema của DB TEST (TEST_DATABASE_ADMIN_URL → cf_test/cf_ci), rồi áp migration.
import { isAppError } from '@flow/shared';
import { resetTestSchemas, runMigrations } from '../admin';
import { parseTestResetEnv } from '../cli-env';

try {
  const env = parseTestResetEnv();
  const input = { appEnv: env.APP_ENV, adminUrl: env.TEST_DATABASE_ADMIN_URL };
  await resetTestSchemas(input);
  await runMigrations(input);
  console.log('DB test đã được tạo lại và migrate.');
} catch (error) {
  console.error(isAppError(error) ? `[${error.code}] ${error.message}` : error);
  process.exit(1);
}

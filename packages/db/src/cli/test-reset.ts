// Xoá và tạo lại schema của DB TEST (TEST_DATABASE_ADMIN_URL → cf_test/cf_ci), rồi áp migration.
import { isAppError } from '@flow/shared';
import { resetTestSchemas, runMigrations } from '../admin';

const input = { appEnv: process.env.APP_ENV, adminUrl: process.env.TEST_DATABASE_ADMIN_URL };

try {
  await resetTestSchemas(input);
  await runMigrations(input);
  console.log('DB test đã được tạo lại và migrate.');
} catch (error) {
  console.error(isAppError(error) ? `[${error.code}] ${error.message}` : error);
  process.exit(1);
}

// Cài schema pg-boss + tạo hàng đợi + cấp quyền cho cf_app (DATABASE_ADMIN_URL, chỉ DB dev/test/ci).
import { isAppError } from '@flow/shared';
import { QUEUES } from '../queue/definitions';
import { installQueueSchema } from '../queue/install';

try {
  await installQueueSchema({
    appEnv: process.env.APP_ENV,
    adminUrl: process.env.DATABASE_ADMIN_URL,
    queues: QUEUES,
  });
  console.log(`Đã cài pg-boss và tạo ${QUEUES.length} hàng đợi.`);
} catch (error) {
  console.error(isAppError(error) ? `[${error.code}] ${error.message}` : 'Cài pg-boss thất bại.');
  process.exit(1);
}

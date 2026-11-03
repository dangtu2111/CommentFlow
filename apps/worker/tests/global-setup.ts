import { resetTestSchemas, runMigrations } from '@flow/db';
import { QUEUES } from '../src/queue/definitions';
import { installQueueSchema } from '../src/queue/install';

/** Hàng đợi chỉ dùng trong test (retryLimit 0 để job lỗi kết thúc ngay ở trạng thái failed). */
export const TEST_WORKSPACE_QUEUE = 'test.workspace-job';
export const TEST_SYSTEM_QUEUE = 'test.system-job';

/** Tạo lại cf_test → migrate → cài pg-boss (bằng cf_owner) + hàng đợi, như quy trình thật. */
export default async function setup(): Promise<void> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl || !process.env.TEST_DATABASE_URL) {
    throw new Error(
      'Chưa đặt TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL (xem env.example). Máy phụ phải đang bật.',
    );
  }
  const input = { appEnv: process.env.APP_ENV, adminUrl };
  await resetTestSchemas(input);
  await runMigrations(input);
  await installQueueSchema({
    ...input,
    queues: [
      ...QUEUES,
      { name: TEST_WORKSPACE_QUEUE, retryLimit: 0 },
      { name: TEST_SYSTEM_QUEUE, retryLimit: 0 },
    ],
  });
}

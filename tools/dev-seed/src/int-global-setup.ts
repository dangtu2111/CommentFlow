import { resetTestSchemas, runMigrations } from '@flow/db';

/** Như packages/db: xoá + migrate lại DB test trước khi chạy (guard của @flow/db chỉ cho cf_test*). */
export default async function setup(): Promise<void> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl || !process.env.TEST_DATABASE_URL || !process.env.TEST_DATABASE_WORKER_URL) {
    throw new Error(
      'Chưa đặt TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL / TEST_DATABASE_WORKER_URL (xem AGENTS.md mục Lệnh).',
    );
  }
  const input = { appEnv: process.env.APP_ENV, adminUrl };
  await resetTestSchemas(input);
  await runMigrations(input);
}

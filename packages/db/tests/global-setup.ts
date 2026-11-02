import { resetTestSchemas, runMigrations } from '../src/admin';

/** Mỗi lần chạy test tích hợp: xoá và tạo lại schema của cf_test, rồi migrate (docs/decisions/002). */
export default async function setup(): Promise<void> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl || !process.env.TEST_DATABASE_URL) {
    throw new Error(
      'Chưa đặt TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL. Tạo .env bằng infra/scripts/print-dev-env.sh ' +
        '(xem AGENTS.md mục Lệnh) hoặc đặt biến môi trường. Máy phụ phải đang bật.',
    );
  }
  const input = { appEnv: process.env.APP_ENV, adminUrl };
  await resetTestSchemas(input);
  await runMigrations(input);
}

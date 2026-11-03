import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../src/admin';

describe('migration', () => {
  it('chạy lại trên DB đã migrate không đổi gì và không lỗi (idempotent)', async () => {
    await expect(
      runMigrations({
        appEnv: process.env.APP_ENV,
        adminUrl: process.env.TEST_DATABASE_ADMIN_URL,
      }),
    ).resolves.toBeUndefined();
  });

  it('từ chối khi APP_ENV là production dù URL là DB test', async () => {
    await expect(
      runMigrations({ appEnv: 'production', adminUrl: process.env.TEST_DATABASE_ADMIN_URL }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
  });

  it('từ chối DB ngoài danh sách cho phép', async () => {
    await expect(
      runMigrations({ appEnv: 'dev', adminUrl: 'postgresql://u:p@192.168.1.124:5433/commentflow' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
  });
});

import { type AuthDb, createAuthDb } from '@flow/db/auth-db';

export type { AuthDb };

/**
 * Mở pool role `cf_auth` (DATABASE_AUTH_URL). Đây là cổng DUY NHẤT để nơi khác (apps/web, worker) có pool xác
 * thực: dependency-cruiser cấm chúng import `@flow/db/auth-db` trực tiếp.
 */
export function openAuthDb(options: { connectionString: string; max?: number }): AuthDb {
  return createAuthDb(options);
}

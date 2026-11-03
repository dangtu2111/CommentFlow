import { type AuthDb, createAuthDb } from '@flow/db/auth-db';

/**
 * Handle MỜ của pool role `cf_auth`: bên ngoài module auth chỉ mở và đóng được, KHÔNG có `.db`/`.transaction`
 * để truy vấn thẳng bảng xác thực. Chỉ createAuth/readSession/revoke (cùng thư mục) mở được handle.
 */
export type AuthHandle = { readonly close: () => Promise<void> };

const inner = new WeakMap<AuthHandle, AuthDb>();

/** Dùng trong module auth và test: bọc một AuthDb đã có thành handle mờ. */
export function wrapAuthDb(authDb: AuthDb): AuthHandle {
  const handle: AuthHandle = Object.freeze({ close: () => authDb.close() });
  inner.set(handle, authDb);
  return handle;
}

export function unwrapAuthDb(handle: AuthHandle): AuthDb {
  const authDb = inner.get(handle);
  if (!authDb) throw new Error('AuthHandle không hợp lệ (phải tạo bằng openAuthDb).');
  return authDb;
}

/**
 * Mở pool role `cf_auth` (DATABASE_AUTH_URL). Cổng DUY NHẤT để apps/web, worker có pool xác thực:
 * dependency-cruiser cấm chúng import `@flow/db/auth-db` trực tiếp.
 */
export function openAuthDb(options: { connectionString: string; max?: number }): AuthHandle {
  return wrapAuthDb(createAuthDb(options));
}

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { type Database, NO_CONTEXT, runInTransaction } from './client';
import { schema } from './schema';

/**
 * Truy cập bảng xác thực bằng role RIÊNG `cf_auth` (chỉ có quyền trên users, sessions, accounts,
 * verifications; không có quyền trên bảng nghiệp vụ) và ngữ cảnh `app.ctx = 'auth'`.
 *
 * CHỈ module auth của saas-core (`packages/saas-core/src/auth/`) được import file này — luật
 * `chi-auth-import-auth-db` của dependency-cruiser bắt mọi nơi khác. Nơi khác dùng qua API của saas-core.
 */
export type AuthDb = {
  /**
   * Drizzle trên pool mà MỌI kết nối mở với `app.ctx = 'auth'` (tham số khởi động). Chỉ truyền cho adapter
   * Better Auth: adapter tự gọi nhiều truy vấn rời rạc nên không bọc từng lệnh bằng `set local` được.
   */
  readonly db: Database;
  /** Một giao dịch có `set local app.ctx = 'auth'` (cho mã tự viết: thu hồi phiên, xóa phiên quá hạn). */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export function createAuthDb(options: { connectionString: string; max?: number }): AuthDb {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 5,
    options: '-c app.ctx=auth',
  });
  return {
    db: drizzle(pool, { schema }),
    transaction: (fn) => runInTransaction(pool, { ...NO_CONTEXT, 'app.ctx': 'auth' }, fn),
    close: () => pool.end(),
  };
}

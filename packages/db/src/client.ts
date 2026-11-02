import { AppError } from '@flow/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { schema } from './schema';

export type Database = NodePgDatabase<typeof schema>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_FAILED', `${label} không phải UUID hợp lệ.`);
  }
  return value;
}

export type FlowDb = {
  /**
   * Chạy `fn` trong MỘT giao dịch có ngữ cảnh workspace (RLS dùng `app.workspace_id`).
   * Đây là đường truy cập duy nhất cho bảng nghiệp vụ (nguyên tắc bất biến #2).
   * `userId` (tuỳ chọn) đặt thêm `app.user_id` để liệt kê workspace của chính người đó.
   */
  withWorkspace<T>(
    workspaceId: string,
    fn: (tx: Database) => Promise<T>,
    options?: { userId?: string },
  ): Promise<T>;
  /** Giao dịch chỉ có ngữ cảnh người dùng (liệt kê workspace của họ); không có workspace. */
  withUser<T>(userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
  /** Giao dịch không ngữ cảnh: chỉ chạm được bảng hệ thống (job không có workspace). */
  withSystem<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Drizzle trên pool, không giao dịch/ngữ cảnh — CHỈ cho bảng hệ thống (xác thực).
   * Bảng nghiệp vụ trả về 0 dòng hoặc bị chặn bởi RLS khi đi đường này.
   */
  readonly system: Database;
  close(): Promise<void>;
};

type Settings = Record<string, string>;

async function runInTransaction<T>(
  pool: pg.Pool,
  settings: Settings,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    // is_local = true: giá trị chỉ sống trong giao dịch này, không rò sang lần dùng lại kết nối.
    for (const [key, value] of Object.entries(settings)) {
      await client.query('SELECT set_config($1, $2, true)', [key, value]);
    }
    const result = await fn(drizzle(client, { schema }));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true; // không rollback được → huỷ kết nối thay vì trả lại pool
    }
    throw error;
  } finally {
    client.release(broken ? true : undefined);
  }
}

export function createDb(options: { connectionString: string; max?: number }): FlowDb {
  const pool = new pg.Pool({ connectionString: options.connectionString, max: options.max ?? 10 });
  return {
    withWorkspace: async (workspaceId, fn, opts) =>
      runInTransaction(
        pool,
        {
          'app.workspace_id': assertUuid(workspaceId, 'workspaceId'),
          ...(opts?.userId ? { 'app.user_id': assertUuid(opts.userId, 'userId') } : {}),
        },
        fn,
      ),
    withUser: async (userId, fn) =>
      runInTransaction(pool, { 'app.user_id': assertUuid(userId, 'userId') }, fn),
    withSystem: (fn) => runInTransaction(pool, {}, fn),
    system: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

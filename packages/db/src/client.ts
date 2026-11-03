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
   * Lưu ý: `tx` KHÔNG phải giao dịch của Drizzle — đừng gọi `tx.transaction()` (BEGIN/COMMIT lồng nhau
   * sẽ kết thúc sớm giao dịch ngoài và mất ngữ cảnh workspace).
   */
  withWorkspace<T>(workspaceId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
  /** Giao dịch chỉ có ngữ cảnh người dùng (liệt kê workspace của họ); không có workspace. */
  withUser<T>(userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Giao dịch không ngữ cảnh: chỉ chạm được bảng hệ thống KHÔNG có RLS (ví dụ `feature_flags`).
   * Không thấy dòng nào của bảng nghiệp vụ và của bảng xác thực (`users`, `sessions`, `accounts`,
   * `verifications`) — các bảng đó cần ngữ cảnh rõ ràng.
   */
  withSystem<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Giao dịch có ngữ cảnh xác thực (`set local app.ctx = 'auth'`): thấy và ghi được toàn bộ
   * `users`, `sessions`, `accounts`, `verifications`. Chỉ dùng trong mã xác thực của saas-core.
   */
  withAuthContext<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Drizzle trên một pool RIÊNG mà mọi kết nối mở với `app.ctx = 'auth'`. CHỈ truyền cho adapter
   * Better Auth (adapter tự gọi nhiều truy vấn rời rạc nên không bọc từng lệnh bằng `set local` được).
   * Không dùng cho truy vấn khác. Pool chỉ được tạo khi truy cập lần đầu.
   */
  readonly auth: Database;
  /**
   * Drizzle trên pool chung, không giao dịch/ngữ cảnh — KHÔNG thấy bảng nghiệp vụ lẫn bảng xác thực.
   * Chỉ còn dùng cho bảng hệ thống không có RLS.
   */
  readonly system: Database;
  /**
   * Đăng ký nhận NOTIFY của Postgres trên kênh `channel` bằng một kết nối riêng.
   * Trả về hàm hủy đăng ký (đóng kết nối). `onError` (tuỳ chọn) được gọi khi kết nối lỗi/đứt.
   */
  listen(
    channel: string,
    onNotify: (payload: string) => void,
    onError?: (error: Error) => void,
  ): Promise<() => Promise<void>>;
  close(): Promise<void>;
};

const CHANNEL_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

type Settings = Record<string, string>;

/**
 * Mỗi giao dịch ĐẶT LẠI mọi biến ngữ cảnh rồi mới đặt biến của đường đang dùng: nếu một kết nối trong pool bị
 * `SET` ở cấp phiên (lỗi mã hoặc tấn công), ngữ cảnh đó không đi vào giao dịch thường (phòng thủ lớp hai).
 */
const NO_CONTEXT: Settings = { 'app.workspace_id': '', 'app.user_id': '', 'app.ctx': '' };

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
  // Pool riêng cho adapter Better Auth: mọi kết nối mở với app.ctx = 'auth' (tham số khởi động).
  // pg.Pool chỉ mở kết nối khi có truy vấn đầu tiên nên tạo sẵn không tốn tài nguyên.
  const authPool = new pg.Pool({
    connectionString: options.connectionString,
    max: Math.min(options.max ?? 10, 5),
    options: '-c app.ctx=auth',
  });
  let authDb: Database | undefined;
  return {
    withWorkspace: async (workspaceId, fn) =>
      runInTransaction(
        pool,
        { ...NO_CONTEXT, 'app.workspace_id': assertUuid(workspaceId, 'workspaceId') },
        fn,
      ),
    withUser: async (userId, fn) =>
      runInTransaction(pool, { ...NO_CONTEXT, 'app.user_id': assertUuid(userId, 'userId') }, fn),
    withSystem: (fn) => runInTransaction(pool, NO_CONTEXT, fn),
    withAuthContext: (fn) => runInTransaction(pool, { ...NO_CONTEXT, 'app.ctx': 'auth' }, fn),
    get auth() {
      authDb ??= drizzle(authPool, { schema });
      return authDb;
    },
    system: drizzle(pool, { schema }),
    listen: async (channel, onNotify, onError) => {
      // Tên kênh được ghép vào câu LISTEN (không dùng được tham số) nên phải kiểm chặt.
      if (!CHANNEL_PATTERN.test(channel)) {
        throw new AppError('VALIDATION_FAILED', 'Tên kênh LISTEN không hợp lệ.');
      }
      const client = new pg.Client({ connectionString: options.connectionString });
      client.on('notification', (message) => {
        if (message.channel === channel) onNotify(message.payload ?? '');
      });
      client.on('error', (error) => onError?.(error));
      await client.connect();
      await client.query(`LISTEN ${channel}`);
      return () => client.end();
    },
    close: async () => {
      await Promise.all([pool.end(), authPool.end()]);
    },
  };
}

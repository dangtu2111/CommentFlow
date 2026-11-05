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
  /**
   * Như `withWorkspace` nhưng DB còn biết NGƯỜI ĐANG THAO TÁC (`app.user_id`): các policy chỉ-Owner
   * (`members` ghi, `invitations`, `workspaces` sửa) chỉ cho qua khi người đó là Owner `active` của workspace.
   * `userId` PHẢI lấy từ phiên đã xác thực phía server, không từ form/URL. Giới hạn (ADR 005 §3): chống quên kiểm quyền
   * và sai id, không chống tiến trình web đã bị chiếm hoàn toàn (kẻ đó tự đặt được `app.user_id`).
   */
  withActor<T>(workspaceId: string, userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Đường HỆ THỐNG của một workspace (job worker: ingest, polling, xử lý hàng đợi): đặt `app.workspace_id` + `app.ctx = 'system'`
   * và KHÔNG có người dùng. Policy ghi của `channels` (cột nền tảng), `posts`, `comments` (INSERT), `webhook_events` đòi
   * `core.is_system_context()`: `withWorkspace()` trần (không ctx) KHÔNG ghi được — quên `withActor` ở đường người dùng thì bị
   * từ chối chứ không được nâng quyền. Chỉ worker/job được gọi; không dùng ở route web/Server Action.
   * Từ migration 0030 (ADR 011) "hệ thống" còn đòi kết nối đăng nhập bằng role `cf_worker` (`DATABASE_WORKER_URL`): `withJob` trên
   * pool `cf_app` (web) KHÔNG phải hệ thống — ghi bảng hệ thống và `read_channel_token` bị từ chối (fail-closed).
   */
  withJob<T>(workspaceId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Giao dịch chỉ có ngữ cảnh người dùng (liệt kê workspace của họ); không có workspace.
   * Chỉ ĐỌC dòng của mình ở users/sessions/accounts (cột không nhạy cảm) và chỉ GHI users.name/image/locale;
   * đổi mật khẩu, email, xác minh, 2FA, phiên chỉ qua luồng Better Auth (`AuthDb`, role cf_auth).
   */
  withUser<T>(userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Giao dịch không ngữ cảnh: chỉ chạm được bảng hệ thống KHÔNG có RLS (ví dụ `feature_flags`).
   * Không thấy dòng nào của bảng nghiệp vụ và của bảng xác thực (`users`, `sessions`, `accounts`,
   * `verifications`) — các bảng đó cần ngữ cảnh rõ ràng.
   */
  withSystem<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
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
export const NO_CONTEXT: Settings = { 'app.workspace_id': '', 'app.user_id': '', 'app.ctx': '' };

export async function runInTransaction<T>(
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
    withWorkspace: async (workspaceId, fn) =>
      runInTransaction(
        pool,
        { ...NO_CONTEXT, 'app.workspace_id': assertUuid(workspaceId, 'workspaceId') },
        fn,
      ),
    withActor: async (workspaceId, userId, fn) =>
      runInTransaction(
        pool,
        {
          ...NO_CONTEXT,
          'app.workspace_id': assertUuid(workspaceId, 'workspaceId'),
          'app.user_id': assertUuid(userId, 'userId'),
        },
        fn,
      ),
    withJob: async (workspaceId, fn) =>
      runInTransaction(
        pool,
        {
          ...NO_CONTEXT,
          'app.workspace_id': assertUuid(workspaceId, 'workspaceId'),
          'app.ctx': 'system',
        },
        fn,
      ),
    withUser: async (userId, fn) =>
      runInTransaction(pool, { ...NO_CONTEXT, 'app.user_id': assertUuid(userId, 'userId') }, fn),
    withSystem: (fn) => runInTransaction(pool, NO_CONTEXT, fn),
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
      await pool.end();
    },
  };
}

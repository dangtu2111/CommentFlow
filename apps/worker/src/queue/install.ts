import { assertMigrationAllowed } from '@flow/db';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { QUEUE_SCHEMA, type QueueDefinition } from './definitions';

const APP_ROLE = 'cf_app';

/**
 * Cài schema pg-boss, tạo hàng đợi và cấp quyền cho role ứng dụng. Chạy bằng DATABASE_ADMIN_URL
 * (role cf_owner), CHỈ trên DB dev/test/ci (cùng luật chặn với migration). Chạy lại được (idempotent).
 * Worker (cf_app) sau đó chỉ cần quyền DML trên schema pgboss, không được tạo/xóa bảng.
 */
export async function installQueueSchema(input: {
  appEnv: string | undefined;
  adminUrl: string | undefined;
  queues: QueueDefinition[];
}): Promise<void> {
  assertMigrationAllowed({ appEnv: input.appEnv, databaseUrl: input.adminUrl });

  const boss = new PgBoss({
    connectionString: input.adminUrl,
    schema: QUEUE_SCHEMA,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
    max: 2,
  });
  boss.on('error', () => {}); // lỗi nền không được làm sập tiến trình cài đặt
  await boss.start();
  try {
    for (const queue of input.queues) {
      if (!(await boss.getQueue(queue.name))) {
        await boss.createQueue(queue.name, { retryLimit: queue.retryLimit ?? 2 });
      }
    }
  } finally {
    await boss.stop({ graceful: true });
  }

  const pool = new pg.Pool({ connectionString: input.adminUrl, max: 1 });
  try {
    // Tên schema/role là hằng số trong mã (không phải dữ liệu người dùng).
    const s = QUEUE_SCHEMA;
    await pool.query(`GRANT USAGE ON SCHEMA ${s} TO ${APP_ROLE}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO ${APP_ROLE}`,
    );
    await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${s} TO ${APP_ROLE}`);
    await pool.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${s} TO ${APP_ROLE}`);
    // Bảng/hàm tạo SAU (ví dụ khi thêm hàng đợi mới) cũng tự có quyền.
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_ROLE}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT EXECUTE ON FUNCTIONS TO ${APP_ROLE}`,
    );
  } finally {
    await pool.end();
  }
}

import {
  assertMigrationAllowed,
  guardStagingFromEnv,
  type StagingMigrateEnv,
  withStagingDatabase,
} from '@flow/db';
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
  await performQueueInstall(input.adminUrl as string, input.queues);
}

/**
 * Cài hàng đợi lên STAGING: cùng bộ cổng + mã xác nhận với `pnpm db:migrate:staging` (CF_CONFIRM_STAGING_MIGRATE),
 * production luôn bị từ chối. `dryRun` chỉ in danh sách hàng đợi, không kết nối DB. `log` không bao giờ chứa URL/host.
 */
export async function installQueueSchemaStaging(input: {
  env: StagingMigrateEnv;
  dryRun: boolean;
  queues: QueueDefinition[];
  log: (line: string) => void;
}): Promise<void> {
  const { databaseName, adminUrl } = guardStagingFromEnv(input.env, {
    requireConfirmation: !input.dryRun,
  });
  input.log(
    `Database: ${databaseName} · chế độ: ${input.dryRun ? 'dry-run (không kết nối)' : 'cài thật'}`,
  );
  input.log(
    `Hàng đợi sẽ đảm bảo có (${input.queues.length}): ${input.queues.map((q) => q.name).join(', ')}`,
  );
  if (input.dryRun) return;
  // Kiểm danh tính DB (tên + dấu cf.env=staging) và giữ khóa tư vấn cùng lúc với migrate.
  await withStagingDatabase(adminUrl, databaseName, async () => {
    await performQueueInstall(adminUrl, input.queues);
  });
}

async function performQueueInstall(adminUrl: string, queues: QueueDefinition[]): Promise<void> {
  const boss = new PgBoss({
    connectionString: adminUrl,
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
    for (const queue of queues) {
      if (!(await boss.getQueue(queue.name))) {
        await boss.createQueue(queue.name, {
          retryLimit: queue.retryLimit ?? 2,
          ...(queue.retryBackoff ? { retryBackoff: true } : {}),
        });
      }
    }
  } finally {
    await boss.stop({ graceful: true });
  }

  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  pool.on('error', () => {}); // lỗi nền không được in chi tiết kết nối
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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppError } from '@flow/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import {
  assertStagingMigrateAllowed,
  type MigrationEntry,
  parseMigrationJournal,
  planMigrations,
} from './staging-migrate-guard';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Biến môi trường mà CLI staging đọc (CLI không đọc file .env nào). */
export type StagingMigrateEnv = {
  APP_ENV?: string | undefined;
  DATABASE_ADMIN_URL?: string | undefined;
  CF_STAGING_DB_HOSTS?: string | undefined;
  CF_CONFIRM_STAGING_MIGRATE?: string | undefined;
};

export function readMigrationJournal(folder: string = MIGRATIONS_FOLDER): MigrationEntry[] {
  const file = `${folder}/meta/_journal.json`;
  try {
    return parseMigrationJournal(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('CONFIG_INVALID', 'Không đọc được journal migration trong mã.', {
      cause: error,
    });
  }
}

/** Kiểm toàn bộ cổng staging từ biến môi trường (dùng chung cho migrate và queue:install). */
export function guardStagingFromEnv(
  env: StagingMigrateEnv,
  options: { requireConfirmation: boolean; migrationsFolder?: string },
): { databaseName: string; adminUrl: string; entries: MigrationEntry[] } {
  const entries = readMigrationJournal(options.migrationsFolder);
  const { databaseName } = assertStagingMigrateAllowed({
    appEnv: env.APP_ENV,
    adminUrl: env.DATABASE_ADMIN_URL,
    allowedHosts: env.CF_STAGING_DB_HOSTS,
    confirmation: env.CF_CONFIRM_STAGING_MIGRATE,
    entries,
    requireConfirmation: options.requireConfirmation,
  });
  // assertStagingMigrateAllowed đã bảo đảm adminUrl có giá trị.
  return { databaseName, adminUrl: env.DATABASE_ADMIN_URL as string, entries };
}

export type StagingMigrateResult = {
  databaseName: string;
  dryRun: boolean;
  pendingBefore: string[];
  pendingAfter: string[];
};

async function readLastAppliedAt(client: pg.PoolClient): Promise<number | null> {
  const exists = await client.query<{ t: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS t`,
  );
  if (!exists.rows[0]?.t) return null;
  const last = await client.query<{ last: string | null }>(
    'SELECT max(created_at)::text AS last FROM drizzle.__drizzle_migrations',
  );
  const value = last.rows[0]?.last;
  return value ? Number(value) : null;
}

/** Đọc trạng thái trong giao dịch READ ONLY: không thể ghi dù mã có lỗi. */
async function readPending(
  pool: pg.Pool,
  entries: MigrationEntry[],
  expectedDatabase: string,
): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    try {
      const current = await client.query<{ db: string }>('SELECT current_database() AS db');
      if (current.rows[0]?.db !== expectedDatabase) {
        throw new AppError(
          'FORBIDDEN',
          'Từ chối: database thật sự đang kết nối khác tên đã xác nhận.',
        );
      }
      const plan = planMigrations(entries, await readLastAppliedAt(client));
      if (plan.aheadOfCode) {
        throw new AppError(
          'CONFLICT',
          'Database đã áp migration mới hơn mã đang chạy; dừng (chạy nhầm bản mã cũ?).',
        );
      }
      return plan.pending.map((e) => e.tag);
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    client.release();
  }
}

/**
 * Migrate staging. `dryRun` chỉ đọc và liệt kê migration chờ. Chạy thật: kiểm trước, áp, kiểm lại (phải hết chờ).
 * `log` nhận dòng tóm tắt — KHÔNG bao giờ chứa URL/mật khẩu/host.
 */
export async function runStagingMigrate(input: {
  env: StagingMigrateEnv;
  dryRun: boolean;
  log: (line: string) => void;
  migrationsFolder?: string;
}): Promise<StagingMigrateResult> {
  const folder = input.migrationsFolder ?? MIGRATIONS_FOLDER;
  const { databaseName, adminUrl, entries } = guardStagingFromEnv(input.env, {
    requireConfirmation: !input.dryRun,
    migrationsFolder: folder,
  });
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    const pendingBefore = await readPending(pool, entries, databaseName);
    input.log(
      `Database: ${databaseName} · chế độ: ${input.dryRun ? 'dry-run (chỉ đọc)' : 'áp thật'}`,
    );
    input.log(`Migration trong mã: ${entries.length} · đang chờ: ${pendingBefore.length}`);
    for (const tag of pendingBefore) input.log(`  - chờ: ${tag}`);
    if (input.dryRun || pendingBefore.length === 0) {
      if (!input.dryRun) input.log('Không có migration chờ; không ghi gì.');
      return { databaseName, dryRun: input.dryRun, pendingBefore, pendingAfter: pendingBefore };
    }
    await migrate(drizzle(pool), { migrationsFolder: folder });
    const pendingAfter = await readPending(pool, entries, databaseName);
    input.log(`Sau khi áp: còn chờ ${pendingAfter.length}`);
    if (pendingAfter.length > 0) {
      throw new AppError(
        'INTERNAL',
        'Áp migration xong nhưng vẫn còn migration chờ; kiểm tra thủ công.',
      );
    }
    return { databaseName, dryRun: false, pendingBefore, pendingAfter };
  } finally {
    await pool.end();
  }
}

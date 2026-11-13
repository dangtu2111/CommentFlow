import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppError } from '@flow/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import {
  ensureBootstrap,
  evaluateBootstrap,
  formatBootstrapProblem,
  readBootstrapState,
} from './bootstrap-check';
import {
  assertStagingMigrateAllowed,
  type HashedMigrationEntry,
  type MigrationEntry,
  parseMigrationJournal,
  planMigrations,
  verifyAppliedHashes,
} from './staging-migrate-guard';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Khóa tư vấn (advisory lock) mức DB: chỉ một lần migrate/cài hàng đợi staging tại một thời điểm. */
export const STAGING_LOCK_KEY = 7_309_000_001;
const LOCK_WAIT_MS = 10_000;
/** Giới hạn cho phiên áp migration: một câu lệnh/khóa bảng không được treo vô hạn. */
const MIGRATE_SESSION_OPTIONS = '-c lock_timeout=30000 -c statement_timeout=900000';
/** DB staging phải được chủ dự án đánh dấu một lần: `ALTER DATABASE <db> SET cf.env = 'staging'`. */
export const STAGING_DB_MARKER_SETTING = 'cf.env';

/** Biến môi trường mà CLI staging đọc (CLI không đọc file .env nào). */
export type StagingMigrateEnv = {
  APP_ENV?: string | undefined;
  DATABASE_ADMIN_URL?: string | undefined;
  CF_STAGING_DB_HOSTS?: string | undefined;
  CF_STAGING_DB_NAME?: string | undefined;
  CF_CONFIRM_STAGING_MIGRATE?: string | undefined;
  /** `true` = người vận hành duy nhất chạy trên máy ảo (bỏ yêu cầu GitHub Actions; mọi cổng khác giữ nguyên). */
  CF_STAGING_SOLO_OPERATOR?: string | undefined;
  GITHUB_ACTIONS?: string | undefined;
  GITHUB_WORKFLOW_REF?: string | undefined;
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

/** Hash giống drizzle: sha256 của nội dung file .sql. */
function withHashes(entries: MigrationEntry[], folder: string): HashedMigrationEntry[] {
  return entries.map((e) => {
    try {
      const sql = readFileSync(`${folder}/${e.tag}.sql`, 'utf8');
      return { ...e, hash: createHash('sha256').update(sql).digest('hex') };
    } catch (error) {
      throw new AppError('CONFIG_INVALID', `Không đọc được file migration ${e.tag}.sql.`, {
        cause: error,
      });
    }
  });
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
    expectedDatabase: env.CF_STAGING_DB_NAME,
    githubActions: env.GITHUB_ACTIONS,
    workflowRef: env.GITHUB_WORKFLOW_REF,
    soloOperator: env.CF_STAGING_SOLO_OPERATOR,
    confirmation: env.CF_CONFIRM_STAGING_MIGRATE,
    entries,
    requireConfirmation: options.requireConfirmation,
  });
  // assertStagingMigrateAllowed đã bảo đảm adminUrl có giá trị.
  return { databaseName, adminUrl: env.DATABASE_ADMIN_URL as string, entries };
}

/** Pool không được làm sập tiến trình hay in chi tiết kết nối khi có lỗi nền. */
function createStagingPool(adminUrl: string, options?: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: adminUrl,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ...(options ? { options } : {}),
  });
  pool.on('error', () => {
    console.error('Lỗi kết nối nền tới database (chi tiết đã ẩn).');
  });
  return pool;
}

/**
 * Kiểm database đích TRONG giao dịch READ ONLY: đúng tên đã xác nhận VÀ có dấu `cf.env = 'staging'`
 * (đặt bằng ALTER DATABASE; thiếu dấu → từ chối, kể cả dry-run).
 */
export async function assertStagingDatabaseIdentity(
  client: pg.ClientBase,
  expectedDatabase: string,
): Promise<void> {
  await client.query('BEGIN READ ONLY');
  try {
    const { rows } = await client.query<{ db: string; marker: string | null }>(
      `SELECT current_database() AS db, current_setting('${STAGING_DB_MARKER_SETTING}', true) AS marker`,
    );
    if (rows[0]?.db !== expectedDatabase) {
      throw new AppError(
        'FORBIDDEN',
        'Từ chối: database thật sự đang kết nối khác tên đã xác nhận.',
      );
    }
    if (rows[0]?.marker !== 'staging') {
      throw new AppError(
        'FORBIDDEN',
        `Từ chối: database chưa có dấu staging (ALTER DATABASE ... SET ${STAGING_DB_MARKER_SETTING} = 'staging').`,
      );
    }
  } finally {
    await client.query('ROLLBACK');
  }
}

/**
 * Chạy `fn` khi đã (1) kiểm danh tính DB đích, (2) giữ khóa tư vấn mức DB trên một kết nối RIÊNG
 * (có lock_timeout/statement_timeout; không dựa vào pool). Pool của `fn` có timeout cho phiên áp.
 */
export async function withStagingDatabase<T>(
  adminUrl: string,
  expectedDatabase: string,
  fn: (pool: pg.Pool) => Promise<T>,
  /** CHỈ cho test: tùy chọn phiên thêm (vd `-c cf.env=staging` giả dấu khi không có quyền ALTER DATABASE). CLI không bao giờ truyền. */
  testSessionOptions = '',
): Promise<T> {
  // `options` luôn đặt tường minh để PGOPTIONS trong môi trường runner không giả được dấu staging.
  const lockClient = new pg.Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 15_000,
    options: testSessionOptions,
  });
  lockClient.on('error', () => {
    console.error('Lỗi kết nối khóa tới database (chi tiết đã ẩn).');
  });
  await lockClient.connect();
  try {
    await lockClient.query(`SET lock_timeout = ${LOCK_WAIT_MS}`);
    await lockClient.query('SET statement_timeout = 30000');
    await assertStagingDatabaseIdentity(lockClient, expectedDatabase);
    try {
      await lockClient.query('SELECT pg_advisory_lock($1)', [STAGING_LOCK_KEY]);
    } catch {
      throw new AppError('CONFLICT', 'Không lấy được khóa: có lần migrate staging khác đang chạy.');
    }
    const pool = createStagingPool(
      adminUrl,
      `${MIGRATE_SESSION_OPTIONS} ${testSessionOptions}`.trim(),
    );
    try {
      return await fn(pool);
    } finally {
      await pool.end();
      await lockClient.query('SELECT pg_advisory_unlock($1)', [STAGING_LOCK_KEY]).catch(() => {});
    }
  } finally {
    await lockClient.end().catch(() => {});
  }
}

export type StagingMigrateResult = {
  databaseName: string;
  dryRun: boolean;
  pendingBefore: string[];
  pendingAfter: string[];
};

async function readAppliedRows(
  client: pg.ClientBase,
): Promise<{ hash: string; createdAt: number }[]> {
  const exists = await client.query<{ t: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS t`,
  );
  if (!exists.rows[0]?.t) return [];
  const { rows } = await client.query<{ hash: string; created_at: string }>(
    'SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations',
  );
  return rows.map((r) => ({ hash: r.hash, createdAt: Number(r.created_at) }));
}

/** Đọc trạng thái trong giao dịch READ ONLY; dừng (CONFLICT) khi DB lệch với mã. */
async function readPending(pool: pg.Pool, entries: HashedMigrationEntry[]): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    try {
      const applied = await readAppliedRows(client);
      const lastAppliedAt = applied.length ? Math.max(...applied.map((r) => r.createdAt)) : null;
      const plan = planMigrations(entries, lastAppliedAt);
      if (plan.aheadOfCode) {
        throw new AppError(
          'CONFLICT',
          'Database đã áp migration mới hơn mã đang chạy; dừng (chạy nhầm bản mã cũ?).',
        );
      }
      const check = verifyAppliedHashes(entries, applied);
      if (check.gaps.length > 0 || check.unknown > 0) {
        throw new AppError(
          'CONFLICT',
          `Lịch sử migration của database lệch với mã (mục bị bỏ sót: ${check.gaps.join(', ') || 'không'}; dòng đã áp không khớp mã: ${check.unknown}); dừng, kiểm tra thủ công.`,
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
 * Toàn bộ trong khóa tư vấn mức DB. `log` nhận dòng tóm tắt — KHÔNG bao giờ chứa URL/mật khẩu/host.
 */
export async function runStagingMigrate(input: {
  env: StagingMigrateEnv;
  dryRun: boolean;
  log: (line: string) => void;
  migrationsFolder?: string;
  /** CHỈ cho test (xem `withStagingDatabase`). */
  testSessionOptions?: string;
}): Promise<StagingMigrateResult> {
  const folder = input.migrationsFolder ?? MIGRATIONS_FOLDER;
  const guarded = guardStagingFromEnv(input.env, {
    requireConfirmation: !input.dryRun,
    migrationsFolder: folder,
  });
  const { databaseName, adminUrl } = guarded;
  const entries = withHashes(guarded.entries, folder);
  return withStagingDatabase(
    adminUrl,
    databaseName,
    async (pool) => {
      const pendingBefore = await readPending(pool, entries);
      input.log(
        `Database: ${databaseName} · chế độ: ${input.dryRun ? 'dry-run (chỉ đọc)' : 'áp thật'}`,
      );
      input.log(`Migration trong mã: ${entries.length} · đang chờ: ${pendingBefore.length}`);
      for (const tag of pendingBefore) input.log(`  - chờ: ${tag}`);
      // Chỉ ĐỌC: dry-run vẫn báo thiếu tiền đề (không tự cài gì).
      const bootstrap = evaluateBootstrap(await readBootstrapState(pool));
      if (!bootstrap.ok) input.log(formatBootstrapProblem(bootstrap));
      if (input.dryRun || pendingBefore.length === 0) {
        if (!input.dryRun) input.log('Không có migration chờ; không ghi gì.');
        return { databaseName, dryRun: input.dryRun, pendingBefore, pendingAfter: pendingBefore };
      }
      // Tiền đề của migration (extension, role): báo rõ thiếu gì thay vì lỗi khó đọc giữa chừng (DB-BOOTSTRAP).
      await ensureBootstrap(pool);
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const pendingAfter = await readPending(pool, entries);
      input.log(`Sau khi áp: còn chờ ${pendingAfter.length}`);
      if (pendingAfter.length > 0) {
        throw new AppError(
          'INTERNAL',
          'Áp migration xong nhưng vẫn còn migration chờ; kiểm tra thủ công.',
        );
      }
      return { databaseName, dryRun: false, pendingBefore, pendingAfter };
    },
    input.testSessionOptions,
  );
}

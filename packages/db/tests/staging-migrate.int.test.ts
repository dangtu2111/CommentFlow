import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAppError } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetTestSchemas } from '../src/admin';
import { readMigrationJournal, runStagingMigrate, STAGING_LOCK_KEY } from '../src/staging-migrate';
import { expectedConfirmation } from '../src/staging-migrate-guard';

// Chạy đường migrate STAGING trên DB test `cf_test` (KHÔNG chạm staging/production): APP_ENV của tiến trình test vẫn là "test",
// chỉ biến `env` truyền vào hàm mới đặt "staging". Cuối file, DB về trạng thái đã migrate đầy đủ như sau global-setup.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL as string;
const parsed = new URL(adminUrl);
const databaseName = decodeURIComponent(parsed.pathname.slice(1));
const entries = readMigrationJournal();
const goodEnv = {
  APP_ENV: 'staging',
  DATABASE_ADMIN_URL: adminUrl,
  CF_STAGING_DB_HOSTS: parsed.host.toLowerCase(),
  CF_STAGING_DB_NAME: databaseName,
  GITHUB_ACTIONS: 'true',
  GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/migrate-staging.yml@refs/heads/main',
  CF_CONFIRM_STAGING_MIGRATE: expectedConfirmation(databaseName, entries),
};

const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });

/**
 * Thư mục migration TIỀN TỐ (N mục đầu của journal thật). Vì sao: mỗi câu lệnh migration là một vòng gọi mạng tới DB trên máy ảo (~5 ms/vòng, ~930
 * câu cho cả lịch sử ⇒ ~7,5 giây một lần áp toàn bộ, tăng theo từng migration mới). Các test KIỂM LOGIC (lệch lịch sử, DB mới hơn mã) chỉ cần
 * vài mục nên dùng tiền tố; chỉ MỘT test ("chạy thật") áp toàn bộ lịch sử thật. Nhờ vậy test không còn sát trần thời gian khi mạng chậm
 * (gap FLAKY-DB-TIMEOUT) mà KHÔNG phải tăng timeout.
 */
function prefixMigrations(count: number): { folder: string; entries: typeof entries } {
  const folder = mkdtempSync(join(tmpdir(), 'cf-prefix-migrations-'));
  mkdirSync(join(folder, 'meta'));
  const journal = JSON.parse(
    readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'),
  );
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) {
    copyFileSync(
      new URL(`../migrations/${entry.tag}.sql`, import.meta.url),
      join(folder, `${entry.tag}.sql`),
    );
  }
  return { folder, entries: journal.entries };
}

const envFor = (migrationEntries: typeof entries) => ({
  ...goodEnv,
  CF_CONFIRM_STAGING_MIGRATE: expectedConfirmation(databaseName, migrationEntries),
});
afterAll(() => pool.end());

async function hasMigrationTable(): Promise<boolean> {
  const { rows } = await pool.query<{ t: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS t`,
  );
  return rows[0]?.t != null;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : 'KHÁC';
  }
  return undefined;
}

describe('runStagingMigrate trên cf_test', () => {
  // Dấu `cf.env=staging` thật do chủ dự án đặt bằng ALTER DATABASE (cần quyền cao hơn cf_owner); ở test giả bằng tùy chọn phiên.
  const MARKER = '-c cf.env=staging';
  const run = (o: Omit<Parameters<typeof runStagingMigrate>[0], 'testSessionOptions'>) =>
    runStagingMigrate({ testSessionOptions: MARKER, ...o });

  beforeEach(async () => {
    await resetTestSchemas({ appEnv: 'test', adminUrl });
  });

  afterAll(async () => {
    await resetTestSchemas({ appEnv: 'test', adminUrl });
    await run({ env: goodEnv, dryRun: false, log: () => {} });
  });

  it('DB thiếu dấu cf.env=staging → FORBIDDEN, kể cả dry-run, và không ghi gì', async () => {
    for (const dryRun of [true, false]) {
      const result = runStagingMigrate({ env: goodEnv, dryRun, log: () => {} }); // không giả dấu
      expect(await codeOf(result)).toBe('FORBIDDEN');
    }
    expect(await hasMigrationTable()).toBe(false);
  });

  it('khóa tư vấn: đang có lần chạy khác giữ khóa → CONFLICT, không ghi', async () => {
    const holder = new pg.Client({ connectionString: adminUrl });
    await holder.connect();
    try {
      await holder.query('SELECT pg_advisory_lock($1)', [STAGING_LOCK_KEY]);
      const result = run({ env: goodEnv, dryRun: false, log: () => {} });
      expect(await codeOf(result)).toBe('CONFLICT');
      expect(await hasMigrationTable()).toBe(false);
    } finally {
      await holder.end();
    }
  }, 30_000);

  it('lịch sử bị lệch (mục giữa chưa áp mà mục sau đã áp) → CONFLICT, không áp thêm', async () => {
    // Logic chỉ cần vài mục: dùng tiền tố 4 mục (xem `prefixMigrations`), không áp cả lịch sử qua mạng.
    const small = prefixMigrations(4);
    const env = envFor(small.entries);
    await run({ env, dryRun: false, log: () => {}, migrationsFolder: small.folder });
    const middle = small.entries[1];
    await pool.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1', [
      middle?.when,
    ]);
    for (const dryRun of [true, false]) {
      const result = run({ env, dryRun, log: () => {}, migrationsFolder: small.folder });
      expect(await codeOf(result)).toBe('CONFLICT');
    }
  });

  it('dry-run liệt kê mọi migration chờ và KHÔNG ghi gì (không tạo schema drizzle)', async () => {
    const lines: string[] = [];
    const result = await run({
      env: { ...goodEnv, CF_CONFIRM_STAGING_MIGRATE: undefined },
      dryRun: true,
      log: (l) => lines.push(l),
    });
    expect(result.pendingBefore).toEqual(entries.map((e) => e.tag));
    expect(result.pendingAfter).toEqual(result.pendingBefore);
    expect(await hasMigrationTable()).toBe(false);
    const text = lines.join('\n');
    expect(text).toContain(databaseName);
    expect(text).not.toContain(parsed.host);
    if (parsed.password) expect(text).not.toContain(decodeURIComponent(parsed.password));
  });

  it('thiếu hoặc sai mã xác nhận → từ chối và không ghi gì', async () => {
    for (const confirmation of [undefined, `${databaseName}@0000`]) {
      const env = { ...goodEnv, CF_CONFIRM_STAGING_MIGRATE: confirmation };
      expect(await codeOf(run({ env, dryRun: false, log: () => {} }))).toBe('FORBIDDEN');
    }
    expect(await hasMigrationTable()).toBe(false);
  });

  it('production, host sai, APP_ENV sai → từ chối trước khi kết nối', async () => {
    for (const patch of [
      { APP_ENV: 'production' },
      { APP_ENV: 'test' },
      { CF_STAGING_DB_HOSTS: 'khac.example:5432' },
    ]) {
      const result = run({
        env: { ...goodEnv, ...patch },
        dryRun: false,
        log: () => {},
      });
      expect(await codeOf(result)).toBe('FORBIDDEN');
    }
    expect(await hasMigrationTable()).toBe(false);
  });

  it('chạy thật: áp hết, kiểm lại không còn chờ; chạy lại không đổi gì', async () => {
    const first = await run({ env: goodEnv, dryRun: false, log: () => {} });
    expect(first.pendingBefore.length).toBe(entries.length);
    expect(first.pendingAfter).toEqual([]);
    expect(await hasMigrationTable()).toBe(true);

    const lines: string[] = [];
    const second = await run({
      env: goodEnv,
      dryRun: false,
      log: (l) => lines.push(l),
    });
    expect(second.pendingBefore).toEqual([]);
    expect(lines.join('\n')).toContain('Không có migration chờ');
  });

  it('DB đã áp migration mới hơn mã → CONFLICT, không ghi', async () => {
    // DB áp 3 mục; chạy nhầm bản mã "cũ" chỉ có 1 mục (giả lập chạy nhầm bản mã cũ). Chỉ cần tiền tố nhỏ cho cả hai.
    const newer = prefixMigrations(3);
    await run({
      env: envFor(newer.entries),
      dryRun: false,
      log: () => {},
      migrationsFolder: newer.folder,
    });
    const older = prefixMigrations(1);
    const result = run({
      env: envFor(older.entries),
      dryRun: false,
      log: () => {},
      migrationsFolder: older.folder,
    });
    expect(await codeOf(result)).toBe('CONFLICT');
  });
});

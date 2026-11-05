import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAppError } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetTestSchemas } from '../src/admin';
import { readMigrationJournal, runStagingMigrate } from '../src/staging-migrate';
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
  CF_CONFIRM_STAGING_MIGRATE: expectedConfirmation(databaseName, entries),
};

const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
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
  beforeEach(async () => {
    await resetTestSchemas({ appEnv: 'test', adminUrl });
  });

  afterAll(async () => {
    await resetTestSchemas({ appEnv: 'test', adminUrl });
    await runStagingMigrate({ env: goodEnv, dryRun: false, log: () => {} });
  });

  it('dry-run liệt kê mọi migration chờ và KHÔNG ghi gì (không tạo schema drizzle)', async () => {
    const lines: string[] = [];
    const result = await runStagingMigrate({
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
      expect(await codeOf(runStagingMigrate({ env, dryRun: false, log: () => {} }))).toBe(
        'FORBIDDEN',
      );
    }
    expect(await hasMigrationTable()).toBe(false);
  });

  it('production, host sai, APP_ENV sai → từ chối trước khi kết nối', async () => {
    for (const patch of [
      { APP_ENV: 'production' },
      { APP_ENV: 'test' },
      { CF_STAGING_DB_HOSTS: 'khac.example' },
    ]) {
      const result = runStagingMigrate({
        env: { ...goodEnv, ...patch },
        dryRun: false,
        log: () => {},
      });
      expect(await codeOf(result)).toBe('FORBIDDEN');
    }
    expect(await hasMigrationTable()).toBe(false);
  });

  it('chạy thật: áp hết, kiểm lại không còn chờ; chạy lại không đổi gì', async () => {
    const first = await runStagingMigrate({ env: goodEnv, dryRun: false, log: () => {} });
    expect(first.pendingBefore.length).toBe(entries.length);
    expect(first.pendingAfter).toEqual([]);
    expect(await hasMigrationTable()).toBe(true);

    const lines: string[] = [];
    const second = await runStagingMigrate({
      env: goodEnv,
      dryRun: false,
      log: (l) => lines.push(l),
    });
    expect(second.pendingBefore).toEqual([]);
    expect(lines.join('\n')).toContain('Không có migration chờ');
  });

  it('DB đã áp migration mới hơn mã → CONFLICT, không ghi', async () => {
    await runStagingMigrate({ env: goodEnv, dryRun: false, log: () => {} });
    // Thư mục migration "cũ": journal chỉ có mục đầu (giả lập chạy nhầm bản mã cũ).
    const folder = mkdtempSync(join(tmpdir(), 'cf-old-migrations-'));
    mkdirSync(join(folder, 'meta'));
    const journal = JSON.parse(
      readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'),
    );
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
    const oldEnv = {
      ...goodEnv,
      CF_CONFIRM_STAGING_MIGRATE: expectedConfirmation(databaseName, journal.entries),
    };
    const result = runStagingMigrate({
      env: oldEnv,
      dryRun: false,
      log: () => {},
      migrationsFolder: folder,
    });
    expect(await codeOf(result)).toBe('CONFLICT');
  });
});

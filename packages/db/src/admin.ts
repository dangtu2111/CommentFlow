import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { unrecordedMigrationTags } from './migration-drift';
import { assertMigrationAllowed, assertTestResetAllowed } from './migration-guard';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

type AdminInput = { appEnv: string | undefined; adminUrl: string | undefined };

/**
 * Sau khi áp: cảnh báo (KHÔNG làm hỏng lệnh) nếu có file migration chưa/không còn khớp sổ — xem `migration-drift.ts`. Cảnh báo
 * để người chạy biết DB dài hạn đã lệch (CI trên DB sạch không bị).
 */
async function warnIfMigrationsDrifted(pool: pg.Pool): Promise<void> {
  const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const recorded = new Set(
    (await pool.query<{ hash: string }>('SELECT hash FROM drizzle.__drizzle_migrations')).rows.map(
      (row) => row.hash,
    ),
  );
  const drifted = unrecordedMigrationTags(
    journal.entries,
    (tag) => readFileSync(`${MIGRATIONS_FOLDER}/${tag}.sql`, 'utf8'),
    recorded,
  );
  if (drifted.length > 0) {
    console.warn(
      `CẢNH BÁO: DB lệch với file migration (mã băm không có trong sổ): ${drifted.join(', ')}. ` +
        'drizzle có thể đã bỏ qua chúng vì mốc thời gian; `pnpm db:check-rls` có thể đỏ. Cách xử lý: docs/workflows/db-drift.md.',
    );
  }
}

/** Áp migration bằng role chủ sở hữu (cf_owner). Chỉ chạy được trên DB dev/test/ci. */
export async function runMigrations({ appEnv, adminUrl }: AdminInput): Promise<void> {
  assertMigrationAllowed({ appEnv, databaseUrl: adminUrl });
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    await warnIfMigrationsDrifted(pool);
  } finally {
    await pool.end();
  }
}

/** Xoá toàn bộ schema ứng dụng của DB test (core, cf, drizzle, pgboss) — chỉ cf_test / cf_ci. */
export async function resetTestSchemas({ appEnv, adminUrl }: AdminInput): Promise<void> {
  assertTestResetAllowed({ appEnv, databaseUrl: adminUrl });
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS core, cf, drizzle, pgboss CASCADE');
  } finally {
    await pool.end();
  }
}

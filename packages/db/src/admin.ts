import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { assertMigrationAllowed, assertTestResetAllowed } from './migration-guard';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

type AdminInput = { appEnv: string | undefined; adminUrl: string | undefined };

/** Áp migration bằng role chủ sở hữu (cf_owner). Chỉ chạy được trên DB dev/test/ci. */
export async function runMigrations({ appEnv, adminUrl }: AdminInput): Promise<void> {
  assertMigrationAllowed({ appEnv, databaseUrl: adminUrl });
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

/** Xoá toàn bộ schema ứng dụng của DB test (core, cf, drizzle) — chỉ cf_test / cf_ci. */
export async function resetTestSchemas({ appEnv, adminUrl }: AdminInput): Promise<void> {
  assertTestResetAllowed({ appEnv, databaseUrl: adminUrl });
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS core, cf, drizzle CASCADE');
  } finally {
    await pool.end();
  }
}

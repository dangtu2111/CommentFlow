// Ghi feature flag cho DEV/TEST/CI bằng khóa admin (ADMIN-FLAGS-PAGE chưa có):
//   pnpm flags:set -- cf.ai.draft on                          bật toàn hệ thống (default_on)
//   pnpm flags:set -- cf.pipeline.v2 on --workspace <uuid>    bật riêng một workspace (override)
// CHỈ trên cf_dev / cf_test* / cf_ci và APP_ENV khác staging/production. Không in URL hay khóa.
import { isAppError } from '@flow/shared';
import pg from 'pg';
import { parseAdminCliEnv } from '../cli-env';
import { applyFlagChange, assertFlagsDatabase, parseFlagsArgs } from '../flags-admin';

try {
  const change = parseFlagsArgs(process.argv.slice(2));
  const env = parseAdminCliEnv();
  assertFlagsDatabase(env.DATABASE_ADMIN_URL, env.APP_ENV);
  const pool = new pg.Pool({ connectionString: env.DATABASE_ADMIN_URL, max: 1 });
  try {
    await applyFlagChange(pool, change);
  } finally {
    await pool.end();
  }
  const scope = change.workspaceId ? `workspace ${change.workspaceId}` : 'toàn hệ thống';
  console.log(`Cờ ${change.key} = ${change.enabled ? 'BẬT' : 'TẮT'} (${scope}).`);
} catch (error) {
  console.error(
    isAppError(error)
      ? `[${error.code}] ${error.message}`
      : error instanceof Error
        ? error.message
        : 'Thất bại.',
  );
  process.exit(1);
}

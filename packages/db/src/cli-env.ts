import { parseEnv } from '@flow/shared';
import { z } from 'zod';
import type { StagingMigrateEnv } from './staging-migrate';

// Biến môi trường của các CLI trong packages/db/src/cli: đọc qua parseEnv (Zod), không đọc process.env thô.
// Biến thiếu vẫn hợp lệ ở đây — cổng migration-guard / staging-guard báo lỗi có nghĩa (mã + câu tiếng Việt).

const optional = z.string().optional();

const adminSchema = z.object({ APP_ENV: optional, DATABASE_ADMIN_URL: optional });
const testResetSchema = z.object({ APP_ENV: optional, TEST_DATABASE_ADMIN_URL: optional });
const checkRlsSchema = z.object({
  CHECK_RLS_TEST: optional,
  DATABASE_ADMIN_URL: optional,
  TEST_DATABASE_ADMIN_URL: optional,
});
const stagingSchema = z.object({
  APP_ENV: optional,
  DATABASE_ADMIN_URL: optional,
  CF_STAGING_DB_HOSTS: optional,
  CF_STAGING_DB_NAME: optional,
  CF_CONFIRM_STAGING_MIGRATE: optional,
  CF_STAGING_SOLO_OPERATOR: optional,
  GITHUB_ACTIONS: optional,
  GITHUB_WORKFLOW_REF: optional,
});

type Source = Record<string, string | undefined>;

export function parseAdminCliEnv(source: Source = process.env) {
  return parseEnv(adminSchema, source);
}

export function parseTestResetEnv(source: Source = process.env) {
  return parseEnv(testResetSchema, source);
}

/** URL cần kiểm RLS: URL test khi `CHECK_RLS_TEST=1`, ngược lại URL admin. */
export function parseCheckRlsEnv(source: Source = process.env): { url: string | undefined } {
  const env = parseEnv(checkRlsSchema, source);
  return { url: env.CHECK_RLS_TEST === '1' ? env.TEST_DATABASE_ADMIN_URL : env.DATABASE_ADMIN_URL };
}

export function parseStagingCliEnv(source: Source = process.env): StagingMigrateEnv {
  return parseEnv(stagingSchema, source);
}

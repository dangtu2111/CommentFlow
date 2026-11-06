// Phần dùng khi chạy ứng dụng (truy vấn, kết nối, schema) nằm ở ./runtime; file này thêm mã migration/quản trị cho CLI và test.

export { resetTestSchemas, runMigrations } from './admin';
export { checkRls, type Queryable, type RlsViolation } from './check-rls';
export {
  parseAdminCliEnv,
  parseCheckRlsEnv,
  parseStagingCliEnv,
  parseTestResetEnv,
} from './cli-env';
export { assertMigrationAllowed, assertTestResetAllowed } from './migration-guard';
export * from './runtime';
export {
  assertStagingDatabaseIdentity,
  guardStagingFromEnv,
  readMigrationJournal,
  runStagingMigrate,
  STAGING_DB_MARKER_SETTING,
  type StagingMigrateEnv,
  type StagingMigrateResult,
  withStagingDatabase,
} from './staging-migrate';
export {
  assertStagingMigrateAllowed,
  CONFIRM_FORMAT,
  expectedConfirmation,
  lastMigrationNumber,
  type MigrationEntry,
  parseMigrationJournal,
  planMigrations,
  verifyAppliedHashes,
} from './staging-migrate-guard';

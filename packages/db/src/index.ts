// Phần dùng khi chạy ứng dụng (truy vấn, kết nối, schema) nằm ở ./runtime; file này thêm mã migration/quản trị cho CLI và test.

export { resetTestSchemas, runMigrations } from './admin';
export { checkRls, type Queryable, type RlsViolation } from './check-rls';
export { assertMigrationAllowed, assertTestResetAllowed } from './migration-guard';
export * from './runtime';

// Migrate lên STAGING (CLI riêng, tách khỏi `migrate.ts`). KHÔNG đọc file .env: biến do job CI cấp.
// Cần: APP_ENV=staging, DATABASE_ADMIN_URL, CF_STAGING_DB_HOSTS, và (khi áp thật) CF_CONFIRM_STAGING_MIGRATE=<tên-db>@<số-migration-cuối>.
// `--dry-run`: chỉ đọc, liệt kê migration chờ. Production luôn bị từ chối.
import { isAppError } from '@flow/shared';
import { runStagingMigrate } from '../staging-migrate';

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length > 0) {
  console.error('Tham số không hợp lệ (chỉ nhận --dry-run).');
  process.exit(2);
}

try {
  const result = await runStagingMigrate({
    env: process.env,
    dryRun: args.includes('--dry-run'),
    log: (line) => console.log(line),
  });
  console.log(result.dryRun ? 'Dry-run xong (không ghi gì).' : 'Migration staging đã xong.');
} catch (error) {
  console.error(
    isAppError(error)
      ? `[${error.code}] ${error.message}`
      : 'Migrate staging thất bại (chi tiết đã ẩn để không lộ chuỗi kết nối).',
  );
  process.exit(1);
}

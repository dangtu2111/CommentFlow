// Cài pg-boss + hàng đợi lên STAGING (CLI riêng, tách khỏi `queue-install.ts`). KHÔNG đọc file .env.
// Cùng biến với `pnpm db:migrate:staging`: APP_ENV=staging, DATABASE_ADMIN_URL, CF_STAGING_DB_HOSTS,
// CF_CONFIRM_STAGING_MIGRATE=<tên-db>@<số-migration-cuối> (áp thật). `--dry-run` không kết nối DB.
import { parseStagingCliEnv } from '@flow/db';
import { isAppError } from '@flow/shared';
import { QUEUES } from '../queue/definitions';
import { installQueueSchemaStaging } from '../queue/install';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--dry-run')) {
  console.error('Tham số không hợp lệ (chỉ nhận --dry-run).');
  process.exit(2);
}
const dryRun = args.includes('--dry-run');

try {
  await installQueueSchemaStaging({
    env: parseStagingCliEnv(),
    dryRun,
    queues: QUEUES,
    log: (line) => console.log(line),
  });
  console.log(
    dryRun ? 'Dry-run xong (không ghi gì).' : 'Đã cài pg-boss và tạo hàng đợi trên staging.',
  );
} catch (error) {
  console.error(
    isAppError(error)
      ? `[${error.code}] ${error.message}`
      : 'Cài pg-boss staging thất bại (chi tiết đã ẩn để không lộ chuỗi kết nối).',
  );
  process.exit(1);
}

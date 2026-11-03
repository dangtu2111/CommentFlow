import { PgBoss } from 'pg-boss';
import type { Logger } from '../logger';
import { QUEUE_SCHEMA } from './definitions';

/**
 * Kết nối pg-boss bằng role ỨNG DỤNG (cf_app): không migrate, không tạo schema — việc đó thuộc
 * bước `queue:install` (role chủ sở hữu). Chỉ gửi/nhận job.
 */
export function createBoss(connectionString: string, logger: Pick<Logger, 'error'>): PgBoss {
  const boss = new PgBoss({
    connectionString,
    schema: QUEUE_SCHEMA,
    migrate: false,
    createSchema: false,
    application_name: 'cf-worker',
    max: 5,
  });
  // Không log nội dung lỗi gốc (có thể chứa chuỗi kết nối); chỉ tên lỗi.
  boss.on('error', (error: Error) => logger.error({ error: error.name }, 'pg-boss báo lỗi'));
  return boss;
}

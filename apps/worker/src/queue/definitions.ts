/** Schema Postgres do pg-boss quản lý (tạo bởi bước cài đặt chạy bằng cf_owner, không phải bởi worker). */
export const QUEUE_SCHEMA = 'pgboss';

export const SYSTEM_PING_QUEUE = 'system.ping';
export { INGEST_QUEUE } from '@flow/shared';

export type QueueDefinition = { name: string; retryLimit?: number; retryBackoff?: boolean };

/**
 * Danh sách hàng đợi của hệ thống. Hàng đợi phải được TẠO trước (bước `queue:install`, role chủ sở hữu)
 * vì worker chạy bằng role ứng dụng không có quyền tạo bảng.
 */
/** Số lần pg-boss THỬ LẠI hàng đợi `ingest` (tổng số lần chạy tối đa = retryLimit + 1). */
export const INGEST_RETRY_LIMIT = 5;

export const QUEUES: QueueDefinition[] = [
  { name: SYSTEM_PING_QUEUE, retryLimit: 0 },
  // docs/09 §9: ingest — thử lại 5 lần, backoff mũ; idempotent theo sự kiện.
  { name: 'ingest', retryLimit: INGEST_RETRY_LIMIT, retryBackoff: true },
];

/** Schema Postgres do pg-boss quản lý (tạo bởi bước cài đặt chạy bằng cf_owner, không phải bởi worker). */
export const QUEUE_SCHEMA = 'pgboss';

export const SYSTEM_PING_QUEUE = 'system.ping';

export type QueueDefinition = { name: string; retryLimit?: number };

/**
 * Danh sách hàng đợi của hệ thống. Hàng đợi phải được TẠO trước (bước `queue:install`, role chủ sở hữu)
 * vì worker chạy bằng role ứng dụng không có quyền tạo bảng.
 */
export const QUEUES: QueueDefinition[] = [{ name: SYSTEM_PING_QUEUE, retryLimit: 0 }];

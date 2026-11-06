/** Schema Postgres do pg-boss quản lý (tạo bởi bước cài đặt chạy bằng cf_owner, không phải bởi worker). */
export const QUEUE_SCHEMA = 'pgboss';

export const SYSTEM_PING_QUEUE = 'system.ping';

import { KB_PUBLISH_QUEUE } from '@flow/shared';

export { HIDE_QUEUE, INGEST_QUEUE, KB_PUBLISH_QUEUE, SEND_QUEUE } from '@flow/shared';

export type QueueDefinition = { name: string; retryLimit?: number; retryBackoff?: boolean };

/**
 * Danh sách hàng đợi của hệ thống. Hàng đợi phải được TẠO trước (bước `queue:install`, role chủ sở hữu)
 * vì worker chạy bằng role ứng dụng không có quyền tạo bảng.
 */
/** Số lần pg-boss THỬ LẠI hàng đợi `ingest` (tổng số lần chạy tối đa = retryLimit + 1). */
export const INGEST_RETRY_LIMIT = 5;

/** Số lần pg-boss THỬ LẠI hàng đợi `send` (tổng số lần chạy tối đa = retryLimit + 1). */
export const SEND_RETRY_LIMIT = 3;

/** Số lần pg-boss THỬ LẠI hàng đợi `hide` (tổng số lần chạy tối đa = retryLimit + 1). */
export const HIDE_RETRY_LIMIT = 3;

export const QUEUES: QueueDefinition[] = [
  { name: SYSTEM_PING_QUEUE, retryLimit: 0 },
  // docs/09 §9: ingest — thử lại 5 lần, backoff mũ; idempotent theo sự kiện.
  { name: 'ingest', retryLimit: INGEST_RETRY_LIMIT, retryBackoff: true },
  // docs/09 §9: send — thử lại 3 lần, backoff mũ; `sendRecheck` + khóa theo yêu cầu chống gửi trùng.
  { name: 'send', retryLimit: SEND_RETRY_LIMIT, retryBackoff: true },
  // FR-044: hide — thử lại 3 lần, backoff mũ; kiểm lại trước khi gọi nền tảng, ẩn lặp lại là idempotent.
  { name: 'hide', retryLimit: HIDE_RETRY_LIMIT, retryBackoff: true },
  // FR-054: kb-publish — xuất bản/khôi phục phiên bản kiến thức; một giao dịch, chạy lại → no_changes nên thử lại an toàn.
  { name: KB_PUBLISH_QUEUE, retryLimit: 2, retryBackoff: true },
];

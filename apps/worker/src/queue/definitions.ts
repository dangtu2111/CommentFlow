/** Schema Postgres do pg-boss quản lý (tạo bởi bước cài đặt chạy bằng cf_owner, không phải bởi worker). */
export const QUEUE_SCHEMA = 'pgboss';

export const SYSTEM_PING_QUEUE = 'system.ping';

import {
  CHANNEL_CHECK_QUEUE,
  DATA_EXPORT_QUEUE,
  KB_PUBLISH_QUEUE,
  KB_REEMBED_QUEUE,
  PIPELINE_QUEUE,
  SHOPIFY_SYNC_QUEUE,
} from '@flow/shared';

export {
  CHANNEL_CHECK_QUEUE,
  DATA_EXPORT_QUEUE,
  HIDE_QUEUE,
  INGEST_QUEUE,
  KB_PUBLISH_QUEUE,
  KB_REEMBED_QUEUE,
  PIPELINE_QUEUE,
  SEND_QUEUE,
  SHOPIFY_SYNC_QUEUE,
} from '@flow/shared';

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

/** FR-115: hàng đợi `abuse` — mỗi workspace một job/15 phút; hiệu ứng idempotent nên thử lại an toàn. */
export const ABUSE_QUEUE = 'abuse';
export const ABUSE_RETRY_LIMIT = 2;

/** docs/09 §9: `pipeline` thử lại 3 lần (khớp `PIPELINE_MAX_ATTEMPTS` của cổng lượt). */
export const PIPELINE_RETRY_LIMIT = 3;

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
  // FR-115: abuse — chấm tín hiệu lạm dụng theo workspace (docs/09 §11.2).
  { name: ABUSE_QUEUE, retryLimit: ABUSE_RETRY_LIMIT, retryBackoff: true },
  // FR-094: data-export — xuất dữ liệu workspace; lỗi nghiệp vụ không ném (→ failed), chỉ lỗi bất ngờ mới thử lại; chạy lại → skipped.
  { name: DATA_EXPORT_QUEUE, retryLimit: 1, retryBackoff: true },
  // Nút "Kiểm tra toàn bộ kết nối": gọi nền tảng bằng token Page; lỗi từng kênh được ghi vào kết quả, không ném; chạy lại an toàn.
  { name: CHANNEL_CHECK_QUEUE, retryLimit: 1, retryBackoff: true },
  // Nút "Đồng bộ ngay" Shopify: upsert theo external_id nên chạy lại an toàn; lỗi từng lần thành KẾT QUẢ, không ném.
  { name: SHOPIFY_SYNC_QUEUE, retryLimit: 1, retryBackoff: true },
  // FR-133: kb-reembed — tạo lại embedding khi đổi mô hình; idempotent (xong rồi → 0 đoạn) nên thử lại an toàn.
  { name: KB_REEMBED_QUEUE, retryLimit: 2, retryBackoff: true },
  // PIPE-ORCHESTRATOR: pipeline — xử lý AI một bình luận; an toàn khi chạy trùng nhờ khóa lượt `pipeline_turns` (lát C).
  { name: PIPELINE_QUEUE, retryLimit: PIPELINE_RETRY_LIMIT, retryBackoff: true },
];

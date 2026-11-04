import { createDb, type FlowDb, recordWebhookEvent } from '@flow/db/runtime';
import { INGEST_QUEUE } from '@flow/shared';
import { loadWebhookEnv } from './env';
import { createMetaWebhookHandlers } from './meta-webhook';
import { enqueueJob } from './queue';

/**
 * Nối `createMetaWebhookHandlers` với DB và hàng đợi thật. Dùng DATABASE_URL (role cf_app): ghi sự kiện trong
 * `withSystem` (ngữ cảnh trần — hàm DEFINER `cf.record_webhook_event` từ chối mọi ngữ cảnh khác) và gửi job `ingest`
 * qua hàng đợi dùng chung (`./queue`). Khởi tạo lười ở lần gọi đầu; một bản duy nhất cho mỗi tiến trình.
 */
const holder = globalThis as typeof globalThis & { __cfWebhookDb?: FlowDb };

function db(): FlowDb {
  holder.__cfWebhookDb ??= createDb({ connectionString: loadWebhookEnv().databaseUrl, max: 3 });
  return holder.__cfWebhookDb;
}

export const metaWebhookHandlers = createMetaWebhookHandlers({
  // Đọc mỗi lần gọi (thiếu/ngắn → undefined → 503); cấu hình sai định dạng ném lỗi → 500, không chấp nhận gì.
  appSecret: () => loadWebhookEnv().appSecret,
  verifyToken: () => loadWebhookEnv().verifyToken,
  record: (input) => db().withSystem((tx) => recordWebhookEvent(tx, input)),
  // Có thể vào hàng đợi nhiều lần (Meta gửi lại, ghi lại sự kiện còn `received`): worker idempotent theo trạng thái
  // sự kiện và ON CONFLICT nên không sao. Retry theo định nghĩa hàng đợi (`queue:install`).
  enqueue: (job) => enqueueJob(INGEST_QUEUE, job),
  warn: (event) => console.warn(JSON.stringify(event)),
});

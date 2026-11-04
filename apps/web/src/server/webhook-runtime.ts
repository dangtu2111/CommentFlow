import { createDb, type FlowDb, recordWebhookEvent } from '@flow/db/runtime';
import { INGEST_QUEUE } from '@flow/shared';
import { PgBoss } from 'pg-boss';
import { loadWebhookEnv } from './env';
import { createMetaWebhookHandlers } from './meta-webhook';

/**
 * Nối `createMetaWebhookHandlers` với DB và hàng đợi thật. Dùng DATABASE_URL (role cf_app): ghi sự kiện trong
 * `withSystem` (ngữ cảnh trần — hàm DEFINER `cf.record_webhook_event` từ chối mọi ngữ cảnh khác) và gửi job `ingest`
 * bằng pg-boss (không migrate, không tạo schema, không chạy giám sát: chỉ gửi job).
 * Khởi tạo lười ở lần gọi đầu; một bản duy nhất cho mỗi tiến trình.
 */
type Runtime = { db: FlowDb; boss: PgBoss; started: Promise<unknown> };
const holder = globalThis as typeof globalThis & { __cfWebhookRuntime?: Runtime };

function runtime(): Runtime {
  if (!holder.__cfWebhookRuntime) {
    const url = loadWebhookEnv().databaseUrl;
    const boss = new PgBoss({
      connectionString: url,
      schema: 'pgboss',
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
      application_name: 'cf-web-webhook',
      max: 2,
    });
    // Chỉ tên lỗi, không nội dung (có thể chứa chuỗi kết nối).
    boss.on('error', (error: Error) =>
      console.warn(JSON.stringify({ event: 'webhook_queue_error', reason: error.name })),
    );
    const started = boss.start();
    // Khởi động pg-boss lỗi (DB chập chờn, schema chưa cài) không được kẹt mãi: xóa bản lỗi để lần gọi sau tạo lại.
    started.catch(() => {
      holder.__cfWebhookRuntime = undefined;
    });
    holder.__cfWebhookRuntime = { db: createDb({ connectionString: url, max: 3 }), boss, started };
  }
  return holder.__cfWebhookRuntime;
}

export const metaWebhookHandlers = createMetaWebhookHandlers({
  // Đọc mỗi lần gọi (thiếu/ngắn → undefined → 503); cấu hình sai định dạng ném lỗi → 500, không chấp nhận gì.
  appSecret: () => loadWebhookEnv().appSecret,
  verifyToken: () => loadWebhookEnv().verifyToken,
  record: (input) => runtime().db.withSystem((tx) => recordWebhookEvent(tx, input)),
  enqueue: async (job) => {
    const { boss, started } = runtime();
    await started;
    // Có thể vào hàng đợi nhiều lần (Meta gửi lại, ghi lại sự kiện còn `received`): worker idempotent theo trạng thái
    // sự kiện và ON CONFLICT nên không sao. Retry theo định nghĩa hàng đợi (`queue:install`).
    await boss.send(INGEST_QUEUE, job);
  },
  warn: (event) => console.warn(JSON.stringify(event)),
});

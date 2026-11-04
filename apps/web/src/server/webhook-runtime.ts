import { createDb, type FlowDb, recordWebhookEvent } from '@flow/db/runtime';
import { INGEST_QUEUE } from '@flow/shared';
import { PgBoss } from 'pg-boss';
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
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Thiếu DATABASE_URL');
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
    holder.__cfWebhookRuntime = {
      db: createDb({ connectionString: url, max: 3 }),
      boss,
      started: boss.start(),
    };
  }
  return holder.__cfWebhookRuntime;
}

export const metaWebhookHandlers = createMetaWebhookHandlers({
  appSecret: () => process.env.META_APP_SECRET || undefined,
  verifyToken: () => process.env.META_WEBHOOK_VERIFY_TOKEN || undefined,
  record: (input) => runtime().db.withSystem((tx) => recordWebhookEvent(tx, input)),
  enqueue: async (job) => {
    const { boss, started } = runtime();
    await started;
    // singletonKey: cùng sự kiện không vào hàng đợi hai lần; retry theo định nghĩa hàng đợi (worker `queue:install`).
    await boss.send(INGEST_QUEUE, job, { singletonKey: job.eventId });
  },
  warn: (event) => console.warn(JSON.stringify(event)),
});

import { PgBoss } from 'pg-boss';
import { loadWebhookEnv } from './env';

/**
 * Hàng đợi pg-boss dùng chung cho phần web (gửi job `ingest` từ webhook, `send` từ hành động trả lời). Role cf_app
 * (DATABASE_URL): không migrate, không tạo schema, không chạy giám sát — chỉ gửi job. Khởi tạo lười, một bản duy nhất
 * cho mỗi tiến trình; khởi động lỗi (DB chập chờn, schema chưa cài) không bị kẹt mãi — lần gọi sau tạo lại.
 */
type Runtime = { boss: PgBoss; started: Promise<unknown> };
const holder = globalThis as typeof globalThis & { __cfWebQueue?: Runtime };

function runtime(): Runtime {
  if (!holder.__cfWebQueue) {
    const boss = new PgBoss({
      connectionString: loadWebhookEnv().databaseUrl,
      schema: 'pgboss',
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
      application_name: 'cf-web-queue',
      max: 2,
    });
    // Chỉ tên lỗi, không nội dung (có thể chứa chuỗi kết nối).
    boss.on('error', (error: Error) =>
      console.warn(JSON.stringify({ event: 'web_queue_error', reason: error.name })),
    );
    const started = boss.start();
    started.catch(() => {
      holder.__cfWebQueue = undefined;
    });
    holder.__cfWebQueue = { boss, started };
  }
  return holder.__cfWebQueue;
}

/** Đẩy một job vào hàng đợi (worker xử lý idempotent nên đẩy trùng không sao). */
export async function enqueueJob(queue: string, data: object): Promise<void> {
  const { boss, started } = runtime();
  await started;
  await boss.send(queue, data);
}

import { createConnectorRegistry } from '@flow/connectors';
import { createDb } from '@flow/db';
import { verifyTokenKeysAtStartup } from './channels/verify-token-keys';
import { loadConfig } from './config';
import { startHealthServer } from './health';
import { createHideHandler } from './jobs/hide';
import { createIngestHandler } from './jobs/ingest';
import { createPingHandler } from './jobs/ping';
import { startRetention } from './jobs/retention';
import { createSendHandler } from './jobs/send';
import { startSweep } from './jobs/sweep';
import { createLogger } from './logger';
import { createBoss } from './queue/boss';
import { HIDE_QUEUE, INGEST_QUEUE, SEND_QUEUE, SYSTEM_PING_QUEUE } from './queue/definitions';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  const db = createDb({ connectionString: config.databaseUrl });
  // Thiếu khóa cho key_version đang dùng = lỗi cấu hình: dừng ngay, không làm hỏng kênh nào.
  await verifyTokenKeysAtStartup(db, config.tokenEncKeys);
  const boss = createBoss(config.databaseUrl, logger);
  // Sổ connector dùng chung cho `send`, `hide` và job quét (RỖNG cho tới `feat/fb-connector`).
  const connectorRegistry = createConnectorRegistry([]);

  // "Sẵn sàng" chỉ khi đã kết nối pg-boss và đăng ký xong các job.
  let ready = false;
  const health = await startHealthServer({ port: config.port, isReady: () => ready });

  await boss.start();
  // batchSize 1: một job lỗi không làm các job đã chạy xong trong cùng lô bị thử lại (tránh tác dụng phụ lặp, ví dụ gửi trùng).
  await boss.work(SYSTEM_PING_QUEUE, { batchSize: 1 }, createPingHandler(db, logger));
  // docs/09 §9: ingest — 10 job đồng thời (mỗi lần một job để lỗi không làm các job khác trong lô bị thử lại).
  await boss.work(
    INGEST_QUEUE,
    { batchSize: 1, localConcurrency: 10 },
    createIngestHandler({ db, logger }),
  );
  // docs/09 §9: send — tối đa 3 job đồng thời; `sendRecheck` + khóa theo yêu cầu chống gửi trùng. Sổ connector RỖNG cho tới
  // khi có connector Facebook thật (`feat/fb-connector`): thiếu connector → yêu cầu ghi `connector_unavailable`.
  await boss.work(
    SEND_QUEUE,
    { batchSize: 1, localConcurrency: 3 },
    createSendHandler({ db, registry: connectorRegistry, logger }),
  );
  // FR-044: hide — ẩn/bỏ ẩn bình luận; kiểm lại trước khi gọi nền tảng, ẩn lặp lại idempotent. Sổ connector RỖNG như `send`.
  await boss.work(
    HIDE_QUEUE,
    { batchSize: 1, localConcurrency: 3 },
    createHideHandler({ db, registry: connectorRegistry, logger }),
  );
  // WEBHOOK-PAYLOAD-RETENTION: dọn payload webhook > 14 ngày khi khởi động rồi mỗi giờ (ngữ cảnh trần).
  const stopRetention = startRetention({ db, logger });
  // SEND-SWEEP + HIDE-SWEEP (ADR 008/009): mỗi 60 giây xử lý lại yêu cầu gửi/ẩn kẹt qua đúng job gửi/ẩn (kiểm lại R1–R3/H1–H3).
  // Cùng sổ connector với hai job trên (RỖNG cho tới `feat/fb-connector`); đăng ký connector thật PHẢI dùng chung một sổ.
  const stopSweep = startSweep({ db, registry: connectorRegistry, logger });
  ready = true;
  logger.info({ port: config.port }, 'worker đã khởi động');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker đang dừng');
    ready = false;
    stopRetention();
    stopSweep();
    await boss.stop({ graceful: true });
    await db.close();
    await health.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  // Chỉ in tên và thông báo (đã được làm sạch); không in cả đối tượng lỗi (có thể chứa chuỗi kết nối).
  console.error(
    'worker không khởi động được:',
    error instanceof Error ? error.message : 'lỗi không rõ',
  );
  process.exit(1);
});

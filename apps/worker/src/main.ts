import { createMockEmbedder } from '@flow/ai';
import { createDb } from '@flow/db';
import { buildConnectorRegistry } from './channels/connector-registry';
import { verifyTokenKeysAtStartup } from './channels/verify-token-keys';
import { loadConfig } from './config';
import { createLocalExportStore } from './export-store';
import { startHealthServer } from './health';
import { createDataExportHandler } from './jobs/data-export';
import { createHideHandler } from './jobs/hide';
import { createIngestHandler } from './jobs/ingest';
import { createKbPublishHandler } from './jobs/kb-publish';
import { createKbReembedHandler } from './jobs/kb-reembed';
import { createPingHandler } from './jobs/ping';
import { startRetention } from './jobs/retention';
import { createSendHandler } from './jobs/send';
import { startSweep } from './jobs/sweep';
import { startWorkspaceDeletion } from './jobs/workspace-deletion';
import { createLogger } from './logger';
import { createBoss } from './queue/boss';
import {
  DATA_EXPORT_QUEUE,
  HIDE_QUEUE,
  INGEST_QUEUE,
  KB_PUBLISH_QUEUE,
  KB_REEMBED_QUEUE,
  SEND_QUEUE,
  SYSTEM_PING_QUEUE,
} from './queue/definitions';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  const db = createDb({ connectionString: config.databaseUrl });
  // Thiếu khóa cho key_version đang dùng = lỗi cấu hình: dừng ngay, không làm hỏng kênh nào.
  await verifyTokenKeysAtStartup(db, config.tokenEncKeys);
  const boss = createBoss(config.databaseUrl, logger);

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
  // Sổ connector: RỖNG khi `FB_CONNECTOR_ENABLED` tắt (mặc định) → yêu cầu ghi `connector_unavailable`, không gọi Meta.
  const registry = buildConnectorRegistry({
    db,
    facebook: config.facebook,
    instagram: config.instagram,
    tiktok: config.tiktok,
    tokenEncKeys: config.tokenEncKeys,
    logger,
  });
  // docs/09 §9: send — tối đa 3 job đồng thời; `sendRecheck` + khóa theo yêu cầu chống gửi trùng.
  await boss.work(
    SEND_QUEUE,
    { batchSize: 1, localConcurrency: 3 },
    createSendHandler({ db, registry, logger }),
  );
  // FR-044: hide — ẩn/bỏ ẩn bình luận; kiểm lại trước khi gọi nền tảng, ẩn lặp lại idempotent. Dùng chung sổ với `send`.
  await boss.work(
    HIDE_QUEUE,
    { batchSize: 1, localConcurrency: 3 },
    createHideHandler({ db, registry, logger }),
  );
  // FR-054: kb-publish — xuất bản/khôi phục phiên bản kiến thức (Owner kiểm lại ở worker). Một job một lúc.
  await boss.work(
    KB_PUBLISH_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    createKbPublishHandler({ db, logger }),
  );
  // FR-133: kb-reembed — tạo lại embedding khi đổi mô hình. Cờ KB_REEMBED_ENABLED mặc định TẮT (chỉ có embedder mock,
  // embedding thật = KB-EMBED-LITELLM): tắt thì không đăng ký hàng đợi.
  if (config.kbReembedEnabled) {
    await boss.work(
      KB_REEMBED_QUEUE,
      { batchSize: 1, localConcurrency: 1 },
      createKbReembedHandler({ db, logger, embedder: createMockEmbedder() }),
    );
  }
  // FR-094: xuất dữ liệu workspace — cờ DATA_EXPORT_ENABLED mặc định TẮT: tắt thì không đăng ký hàng đợi, không dọn tệp.
  const exportStore = config.dataExport.enabled
    ? createLocalExportStore(config.dataExport.dir)
    : undefined;
  if (exportStore) {
    await boss.work(
      DATA_EXPORT_QUEUE,
      { batchSize: 1, localConcurrency: 1 },
      createDataExportHandler({ db, logger, store: exportStore }),
    );
  }
  // WEBHOOK-PAYLOAD-RETENTION: dọn payload webhook > 14 ngày khi khởi động rồi mỗi giờ (ngữ cảnh trần).
  // Có kho tệp xuất thì dọn thêm yêu cầu xuất kẹt/hết hạn (xóa tệp).
  const stopRetention = startRetention({ db, logger, exportStore });
  // WORKSPACE-DELETE (FR-094): xóa vĩnh viễn workspace đã xác nhận 2 bước và hết thời gian chờ; cờ mặc định TẮT.
  const stopWorkspaceDeletion = startWorkspaceDeletion({
    db,
    logger,
    enabled: config.workspaceDeleteEnabled,
  });
  // FR-023 quét bù: cờ POLLING_ENABLED mặc định TẮT (đường gọi Meta thật). Lõi job đã sẵn (`jobs/polling.ts`) nhưng chưa
  // có bản DB của `ChannelLister` (cần hàm DEFINER liệt kê kênh xuyên workspace = migration của làn b; gap
  // `POLLING-CHANNEL-LIST`, QP4) → bật cờ mà thiếu thì báo lỗi rõ và KHÔNG chạy, không đoán đường vòng.
  if (config.pollingEnabled) {
    logger.error(
      'POLLING_ENABLED bật nhưng chưa có hàm liệt kê kênh (POLLING-CHANNEL-LIST): quét bù KHÔNG chạy',
    );
  }
  // SEND-SWEEP + HIDE-SWEEP (ADR 008/009): mỗi 60 giây xử lý lại yêu cầu gửi/ẩn kẹt qua đúng job gửi/ẩn (kiểm lại R1–R3/H1–H3).
  // Dùng chung sổ connector `registry` với `send`/`hide`.
  const stopSweep = startSweep({ db, registry, logger });
  ready = true;
  logger.info({ port: config.port }, 'worker đã khởi động');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker đang dừng');
    ready = false;
    stopRetention();
    stopWorkspaceDeletion();
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

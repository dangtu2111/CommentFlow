import { createLlmDepsFromEnv } from '@flow/ai';
import { createTokenCipher, parseTokenKeys } from '@flow/connectors';
import {
  countEmbeddingModels,
  countRepliesForCommentThread,
  createDb,
  DEFAULT_MERGE_WINDOW_SECONDS,
  getMergeWindowSeconds,
} from '@flow/db';
import { buildConnectorRegistry } from './channels/connector-registry';
import { verifyTokenKeysAtStartup } from './channels/verify-token-keys';
import { loadConfig } from './config';
import { checkEmbeddingAtStartup } from './embedding-startup-check';
import { createLocalExportStore } from './export-store';
import { startHealthServer } from './health';
import { createChannelCheckHandler } from './jobs/channel-check';
import { createDataExportHandler } from './jobs/data-export';
import { createHideHandler } from './jobs/hide';
import {
  createIngestHandler,
  FIRST_COMMENT_PRIORITY,
  type IngestPipelineHook,
} from './jobs/ingest';
import { createKbPublishHandler } from './jobs/kb-publish';
import { createKbReembedHandler } from './jobs/kb-reembed';
import { createPingHandler } from './jobs/ping';
import { createPipelineHandler } from './jobs/pipeline-job';
import { startPipelineSweep } from './jobs/pipeline-sweep';
import { startRetention } from './jobs/retention';
import { createSendHandler } from './jobs/send';
import { createShopifySyncHandler } from './jobs/shopify-sync';
import { startSweep } from './jobs/sweep';
import { startWorkspaceDeletion } from './jobs/workspace-deletion';
import { createLogger } from './logger';
import { createBoss } from './queue/boss';
import {
  CHANNEL_CHECK_QUEUE,
  DATA_EXPORT_QUEUE,
  HIDE_QUEUE,
  INGEST_QUEUE,
  KB_PUBLISH_QUEUE,
  KB_REEMBED_QUEUE,
  PIPELINE_QUEUE,
  SEND_QUEUE,
  SHOPIFY_SYNC_QUEUE,
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
  // PIPE-ORCHESTRATOR: cờ PIPELINE_ENABLED mặc định TẮT; bật thì cần LLM đã cấu hình (extractor + drafter), thiếu → KHÔNG chạy
  // (không bao giờ chạy bình luận thật bằng bản mẫu).
  const llm = config.pipeline.enabled
    ? createLlmDepsFromEnv({
        env: process.env,
        db: { withWorkspace: (id, fn) => db.withJob(id, fn) },
      })
    : undefined;
  const pipelineOn = Boolean(llm?.extractor && llm?.drafter);
  if (config.pipeline.enabled && !pipelineOn) {
    logger.error(
      {},
      'PIPELINE_ENABLED=true nhưng thiếu cấu hình LLM (LITELLM_*, CLASSIFY/DRAFT_LLM_ENABLED): pipeline KHÔNG chạy',
    );
  }
  const pipelineHook: IngestPipelineHook | undefined = pipelineOn
    ? {
        enqueue: async (job, startAfterSeconds, priority) => {
          await boss.send(PIPELINE_QUEUE, job, { startAfter: startAfterSeconds, priority });
        },
        // FR-167: bình luận ĐẦU TIÊN của khách dưới bài (chưa có câu AI nào trong 24 giờ) được ưu tiên.
        priority: (workspaceId, commentId) =>
          db.withJob(workspaceId, async (tx) =>
            (await countRepliesForCommentThread(tx, workspaceId, commentId, new Date())) === 0
              ? FIRST_COMMENT_PRIORITY
              : 0,
          ),
        flagEnabled: true,
        allowedWorkspaceIds: config.pipeline.workspaceIds,
        mergeWindowSeconds: (workspaceId) =>
          db.withJob(workspaceId, (tx) =>
            getMergeWindowSeconds(tx, workspaceId, DEFAULT_MERGE_WINDOW_SECONDS),
          ),
      }
    : undefined;
  await boss.work(
    INGEST_QUEUE,
    { batchSize: 1, localConcurrency: 10 },
    createIngestHandler({ db, logger, ...(pipelineHook ? { pipeline: pipelineHook } : {}) }),
  );
  let stopPipelineSweep: (() => void) | undefined;
  if (pipelineOn && llm?.extractor && llm.drafter) {
    // docs/09 §9: pipeline — 5 job đồng thời, thử lại 3 lần; an toàn khi chạy trùng nhờ khóa lượt (`pipeline_turns`).
    await boss.work(
      PIPELINE_QUEUE,
      { batchSize: 1, localConcurrency: 5 },
      createPipelineHandler({
        db,
        logger,
        llm: {
          extractor: llm.extractor,
          drafter: llm.drafter,
          ...(llm.rewriter ? { rewriter: llm.rewriter } : {}),
        },
        flagEnabled: true,
        allowedWorkspaceIds: config.pipeline.workspaceIds,
        turnLimit: config.pipeline.turnLimit,
        // Cùng embedder với ô Thử AI và `kb-reembed` (trước đây job pipeline KHÔNG truyền → rơi về mock, lệch với dữ liệu bge-m3).
        ...(config.embedding.embedder ? { embedder: config.embedding.embedder } : {}),
      }),
    );
    stopPipelineSweep = startPipelineSweep({
      db,
      logger,
      enqueue: async (job) => {
        await boss.send(PIPELINE_QUEUE, job);
      },
      flagEnabled: true,
      allowedWorkspaceIds: config.pipeline.workspaceIds,
    });
  }
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
  // Nút "Kiểm tra toàn bộ kết nối": gọi nền tảng bằng token Page, ghi kết quả từng kênh. Connector tắt → kết quả `unavailable`.
  await boss.work(
    CHANNEL_CHECK_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    createChannelCheckHandler({
      db,
      connectorFor: () => {
        const connector = registry.has('facebook') ? registry.get('facebook') : undefined;
        const check = connector?.checkConnection?.bind(connector);
        return check ? { checkConnection: check } : undefined;
      },
      logger,
    }),
  );
  // Nút "Đồng bộ ngay" Shopify (SHOPIFY-CONNECT-STORE): cờ SHOPIFY_ENABLED tắt → ghi kết quả `unavailable`, không gọi Shopify.
  await boss.work(
    SHOPIFY_SYNC_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    createShopifySyncHandler({
      db,
      cipher: config.tokenEncKeys
        ? createTokenCipher(parseTokenKeys(config.tokenEncKeys))
        : undefined,
      enabled: config.shopify.enabled,
      ...(config.shopify.apiVersion ? { apiVersion: config.shopify.apiVersion } : {}),
      logger,
    }),
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
  // FR-133: kb-reembed — tạo lại embedding khi đổi model. KHÔNG có embedder giả khi chạy: cờ KB_REEMBED_ENABLED=true mà thiếu embedding thật
  // (ML_EMBED_ENABLED=true + ML_URL) → LỖI RÕ khi khởi động (không âm thầm tạo vector giả làm lệch dữ liệu bge-m3).
  logger.info({ embedding: config.embedding.describe }, 'cấu hình embedding');
  // Kiểm lệch model embedding với dữ liệu đã lưu (FR-133): chỉ log; khi lệch, nhánh vector tự tắt ở từng lượt (không trộn vector khác model).
  await checkEmbeddingAtStartup({
    configuredModel: config.embedding.model,
    workspaceIds: config.pipeline.workspaceIds,
    count: (workspaceId) => db.withJob(workspaceId, (tx) => countEmbeddingModels(tx, workspaceId)),
    logger,
  });
  if (config.kbReembedEnabled) {
    if (config.embedding.kind !== 'ml') {
      throw new Error(
        'KB_REEMBED_ENABLED=true cần embedding thật: đặt ML_EMBED_ENABLED=true và ML_URL (sửa .env.local rồi khởi động lại; không có embedder giả).',
      );
    }
    await boss.work(
      KB_REEMBED_QUEUE,
      { batchSize: 1, localConcurrency: 1 },
      createKbReembedHandler({ db, logger, embedder: config.embedding.embedder }),
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
    stopPipelineSweep?.();
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

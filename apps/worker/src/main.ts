import {
  createEmbeddingResolver,
  createLlmClient,
  createLlmDepsFromEnv,
  createLlmDistiller,
  createMlReranker,
  resolveEmbeddingConfig,
} from '@flow/ai';
import { createTokenCipher, parseTokenKeys } from '@flow/connectors';
import {
  countEmbeddingModels,
  countRepliesForCommentThread,
  createDb,
  DEFAULT_MERGE_WINDOW_SECONDS,
  getEmbeddingState,
  getMergeWindowSeconds,
} from '@flow/db';
import { createFlags } from '@flow/saas-core';
import {
  AI_STEP_FLAGS,
  DISTILL_FLAG,
  FACT_SLOTS_FLAG,
  FLAG_DEFAULTS,
  GUARD_FACTS_FLAG,
  kbSyncEnqueueOptions,
  PIPELINE_FLAG,
} from '@flow/shared';
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
import { createKbSyncHandler } from './jobs/kb-sync';
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
  KB_SYNC_QUEUE,
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
  // Feature flag DB (docs/09 §10): bật/tắt từng bước AI theo workspace (`cf.ai.*`); NOTIFY `flags_changed` có hiệu lực ngay, mất LISTEN thì cache 30 giây.
  const flags = createFlags({
    db,
    defaults: { ...FLAG_DEFAULTS },
    onReadError: (error) =>
      logger.error(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'không đọc được feature flag — dùng mặc định trong mã',
      ),
    onListenEvent: (event) =>
      logger.warn({ type: event.type, attempt: event.attempt }, 'kết nối nghe flags_changed'),
  });
  await flags.start();
  const llm = createLlmDepsFromEnv({
    env: process.env,
    db: { withWorkspace: (id, fn) => db.withJob(id, fn) },
    isStepEnabled: (step, workspaceId) => flags.isEnabled(AI_STEP_FLAGS[step], { workspaceId }),
    // Cờ bật mà thiếu URL/khóa/tên model: nêu rõ lỗi cấu hình (không có model mặc định).
    onMisconfigured: (message) => logger.error({}, message),
  });
  // Cờ DB `cf.pipeline.v2` theo workspace (thay PIPELINE_ENABLED/PIPELINE_WORKSPACE_IDS); đọc ở MỖI lần quyết định, NOTIFY có hiệu lực ngay.
  const pipelineEnabledFor = (workspaceId: string) =>
    flags.isEnabled(PIPELINE_FLAG, { workspaceId });
  const embeddingResolver = createEmbeddingResolver({ service: config.embeddingService });
  // Rerank THẬT qua ml (bật bằng ML_RERANK_ENABLED=true + ML_URL); tắt → quyết định liên quan bằng cosine.
  const reranker = config.rerankService ? createMlReranker(config.rerankService) : undefined;
  // Pipeline chỉ được đăng ký khi LLM ĐÃ cấu hình đủ (URL/khóa/tên model hai bước); thiếu → KHÔNG chạy (không bao giờ chạy bình luận thật bằng bản mẫu).
  const pipelineOn = Boolean(llm.extractor && llm.drafter);
  if (!pipelineOn) {
    logger.warn(
      {},
      'pipeline KHÔNG chạy: thiếu cấu hình LLM (LITELLM_BASE_URL/LITELLM_API_KEY, CLASSIFY_LLM_MODEL/DRAFT_LLM_MODEL); bật cờ cf.pipeline.v2 cũng chưa có tác dụng',
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
        isEnabled: pipelineEnabledFor,
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
  if (pipelineOn && llm.extractor && llm.drafter) {
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
        pipelineEnabled: pipelineEnabledFor,
        factSlotsEnabled: (workspaceId: string) =>
          flags.isEnabled(FACT_SLOTS_FLAG, { workspaceId }),
        guardFactsEnabled: (workspaceId: string) =>
          flags.isEnabled(GUARD_FACTS_FLAG, { workspaceId }),
        turnLimit: config.pipeline.turnLimit,
        // Cờ DB cf.ai.* theo workspace + cấu hình đủ; tắt → lượt bị bỏ qua (`ai_disabled`).
        llmReady: (workspaceId) => (llm?.ready ? llm.ready(workspaceId) : Promise.resolve(false)),
        // Model hoạt động đọc từ DB mỗi vài giây (`cf.embedding_state`); env chỉ bật/tắt dịch vụ ml. Không có embedder giả (FR-133).
        resolveEmbedding: (tx) => embeddingResolver.resolve(() => getEmbeddingState(tx)),
        ...(reranker ? { reranker } : {}),
        onRerankFailure: (workspaceId, error) =>
          logger.warn(
            { workspaceId, reason: error instanceof Error ? error.name : 'unknown' },
            'rerank lỗi: suy giảm về cosine',
          ),
      }),
    );
    stopPipelineSweep = startPipelineSweep({
      db,
      logger,
      enqueue: async (job) => {
        await boss.send(PIPELINE_QUEUE, job);
      },
      isEnabled: pipelineEnabledFor,
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
      requestKbSync: (workspaceId) =>
        boss
          .send(KB_SYNC_QUEUE, { workspaceId }, kbSyncEnqueueOptions(workspaceId))
          .then(() => undefined),
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
  // KB-DISTILL (M3): chắt lọc sau đồng bộ chỉ chạy khi LLM đã cấu hình (URL + khóa + tên model) VÀ cờ `cf.ai.distill` của workspace bật. Model: `DISTILL_LLM_MODEL`,
  // chưa đặt thì dùng model bước soạn (`DRAFT_LLM_MODEL`, model thật đã cấu hình — không phải model mặc định/giả). Thiếu cấu hình → bước TẮT, log rõ.
  const distillModel = (process.env.DISTILL_LLM_MODEL ?? process.env.DRAFT_LLM_MODEL)?.trim();
  const litellmUrl = process.env.LITELLM_BASE_URL?.trim();
  const litellmKey = process.env.LITELLM_API_KEY?.trim();
  const distill =
    distillModel && litellmUrl && litellmKey
      ? {
          enabled: (workspaceId: string) => flags.isEnabled(DISTILL_FLAG, { workspaceId }),
          distiller: createLlmDistiller({
            model: distillModel,
            llm: createLlmClient({
              db: {
                withWorkspace: (id: string, fn: Parameters<typeof db.withJob>[1]) =>
                  db.withJob(id, fn),
              } as unknown as Parameters<typeof createLlmClient>[0]['db'],
              baseUrl: litellmUrl,
              apiKey: litellmKey,
              logger: { warn: (fields, message) => logger.warn(fields, message) },
            }),
          }),
        }
      : undefined;
  if (!distill) {
    logger.info(
      {},
      'kb-distill TẮT: thiếu LITELLM_BASE_URL/LITELLM_API_KEY hoặc DISTILL_LLM_MODEL/DRAFT_LLM_MODEL',
    );
  }
  // KB-SYNC-DRAFT: kb-sync — nguồn nhập tay → bản nháp (embedding thật theo model hoạt động ở DB; thiếu → lỗi rõ). Một job một lúc.
  await boss.work(
    KB_SYNC_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    createKbSyncHandler({
      db,
      logger,
      ...(distill ? { distill } : {}),
      resolveEmbedding: async (tx) =>
        (await embeddingResolver.resolve(() => getEmbeddingState(tx))).config,
    }),
  );
  // Kiểm lệch model embedding với dữ liệu đã lưu (FR-133): chỉ log; khi lệch, nhánh vector tự tắt ở từng lượt (không trộn vector khác model).
  const embeddingState = await db.withSystem((tx) => getEmbeddingState(tx));
  const startupEmbedding = resolveEmbeddingConfig(
    config.embeddingService,
    embeddingState.activeModel,
  );
  logger.info(
    { embedding: startupEmbedding.describe, revision: embeddingState.revision },
    'cấu hình embedding',
  );
  await checkEmbeddingAtStartup({
    configuredModel: startupEmbedding.model,
    offNote: startupEmbedding.describe.note,
    // Danh sách workspace không còn nằm trong env: kiểm lệch model chạy ở MỖI lượt pipeline (log lỗi khi lệch).
    workspaceIds: [],
    count: (workspaceId) => db.withJob(workspaceId, (tx) => countEmbeddingModels(tx, workspaceId)),
    logger,
  });
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
    await flags.stop();
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

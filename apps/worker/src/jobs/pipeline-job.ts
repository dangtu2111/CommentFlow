import {
  createAbbreviationDict,
  type Drafter,
  type EmbeddingResolution,
  type Extractor,
  evaluateReplyCap,
  loadWorkspaceKnowledge,
  type PolicyFacts,
  parseConversationState,
  policyFactsFromRows,
  type Reranker,
  type Rewriter,
  type StockMode,
  selectCustomerContext,
  type TryKnowledge,
} from '@flow/ai';
import {
  type Database,
  DEFAULT_MERGE_WINDOW_SECONDS,
  type FlowDb,
  getMergeWindowSeconds,
  listApprovedPolicyFacts,
  loadPipelineContext,
  mergeCommentGroup,
  requestManualPipelineRun,
} from '@flow/db';
import {
  DEFAULT_USAGE_TIME_ZONE,
  type IngestSource,
  type PipelineJob,
  pipelineJobSchema,
  shouldAutoRunPipeline,
} from '@flow/shared';
import type { Logger } from '../logger';
import { type RunCommentOutcome, runCommentPipeline } from './pipeline-run';
import type { BatchHandler } from './run-job';

/**
 * Job `pipeline` cho MỘT bình luận (PIPE-ORCHESTRATOR lát E). Nạp ngữ cảnh thật (`loadPipelineContext`), dựng nguồn kiến thức bằng
 * HÀM DÙNG CHUNG với ô Thử AI (`loadWorkspaceKnowledge`; worker chỉ đọc `kb_version` ĐÃ XUẤT BẢN do ngữ cảnh trả), rồi gọi
 * `runCommentPipeline` (cổng lượt → pipeline → ghi). KHÔNG giữ giao dịch qua lời gọi LLM: mỗi lần tìm kiếm mở giao dịch ngắn.
 */
export type PipelineJobConfig = {
  db: FlowDb;
  llm: { extractor: Extractor; drafter: Drafter; rewriter?: Rewriter };
  /** Workspace có được chạy AI không (cờ DB `cf.ai.*` + cấu hình đủ). Tắt → lượt bị bỏ qua (`ai_disabled`), bình luận giữ nguyên. */
  llmReady?: (workspaceId: string) => Promise<boolean>;
  /** `PIPELINE_ENABLED` và `PIPELINE_WORKSPACE_IDS` (Q-POR1) — chỉ chặn đường TỰ ĐỘNG; `manual` là nhân viên chủ động bấm. */
  /** Cờ DB `cf.pipeline.v2` cho workspace (chỉ chặn đường TỰ ĐỘNG; `manual` là nhân viên chủ động bấm). */
  pipelineEnabled: (workspaceId: string) => Promise<boolean>;
  /** Cờ DB `cf.ai.fact_slots` theo workspace (ADR 017): BẬT → câu trả lời đi đường fact plan (số/chính sách do code điền). Thiếu/lỗi đọc cờ → TẮT. */
  factSlotsEnabled?: (workspaceId: string) => Promise<boolean>;
  /** Hạn mức lượt/tháng (`resolveAiTurnLimit`). */
  turnLimit: number;
  /**
   * Cấu hình embedding (model hoạt động từ DB + dịch vụ ml từ env). Thiếu/off/lỗi → không có nhánh vector (toàn văn + trigram); KHÔNG có embedder giả.
   */
  resolveEmbedding?: (tx: Database) => Promise<EmbeddingResolution>;
  /** Sự cố dịch vụ embedding giữa lượt (đã suy giảm về toàn văn/trigram); không kèm nội dung. */
  onEmbeddingFailure?: (workspaceId: string, error: unknown) => void;
  /** Gọi khi model embedding lệch dữ liệu của workspace (nhánh vector đã tắt cho lượt này); không kèm nội dung kiến thức. */
  /** Rerank THẬT qua ml (bge-reranker-v2-m3); thiếu → cosine. Không có bản giả khi chạy. */
  reranker?: Reranker;
  /** Sự cố dịch vụ rerank giữa lượt (đã suy giảm về cosine); không kèm nội dung. */
  onRerankFailure?: (workspaceId: string, error: unknown) => void;
  onEmbeddingMismatch?: (workspaceId: string, mismatches: readonly unknown[]) => void;
  now?: () => Date;
};

export type PipelineJobOutcome = RunCommentOutcome | { kind: 'ignored'; reason: string };

/** Nguồn rỗng cho workspace chưa có dữ liệu thật: không bịa số liệu mẫu cho bình luận thật. */
const EMPTY_KNOWLEDGE: TryKnowledge = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};

const DEFAULT_VOICE = { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' } as const;

/** Bọc nguồn kiến thức: mỗi lời gọi mở một giao dịch NGẮN (`withJob`) rồi gắn lại nguồn trên giao dịch đó. */
function perCallKnowledge(
  db: FlowDb,
  workspaceId: string,
  bind: (tx: Database) => TryKnowledge,
  productNames: readonly string[],
): TryKnowledge {
  const run = <T>(fn: (k: TryKnowledge) => Promise<T>): Promise<T> =>
    db.withJob(workspaceId, (tx) => fn(bind(tx)));
  return {
    productNames,
    matchProducts: (mentions) => run((k) => k.matchProducts(mentions)),
    // Nhận sản phẩm theo id (lượt trước / gắn bài, Q-POR12): thiếu trong nguồn gốc thì không có đường dự phòng này.
    resolveProducts: (ids) =>
      run(async (k) =>
        k.resolveProducts ? k.resolveProducts(ids) : { ids: [], names: [], missingAxes: [] },
      ),
    lookupProductFacts: (ids) => run((k) => k.lookupProductFacts(ids)),
    searchKb: (query, context) => run((k) => k.searchKb(query, context)),
    lookupPlanProducts: (ids, options) =>
      run(async (k) => (k.lookupPlanProducts ? k.lookupPlanProducts(ids, options) : [])),
  };
}

export async function runPipelineJob(
  config: PipelineJobConfig,
  job: PipelineJob,
): Promise<PipelineJobOutcome> {
  const { db } = config;
  const { workspaceId } = job;
  if (config.llmReady && !(await config.llmReady(workspaceId))) {
    return { kind: 'ignored', reason: 'ai_disabled' };
  }
  let commentId = job.commentId;
  const now = (config.now ?? (() => new Date()))();

  // Chạy lại THỦ CÔNG ("Soạn gợi ý", Q-POR8/Q-POR11): đưa bình luận + khóa lượt về trạng thái xử lý được và ghi `action_logs` (ai bấm). Vẫn
  // qua đúng cổng dừng khẩn cấp/hạn mức/trần phía dưới (không đường tắt). Thiếu người yêu cầu / không đủ điều kiện → bỏ qua.
  let draftSince: Date | undefined;
  if (job.trigger === 'manual') {
    if (!job.requestedBy) return { kind: 'ignored', reason: 'missing_requester' };
    const requestedBy = job.requestedBy;
    const rerun = await db.withJob(workspaceId, (tx) =>
      requestManualPipelineRun(tx, workspaceId, commentId, requestedBy),
    );
    if (!rerun.eligible) return { kind: 'ignored', reason: rerun.reason };
    draftSince = rerun.startedAt;
  }

  let context = await db.withJob(workspaceId, (tx) =>
    loadPipelineContext(tx, workspaceId, commentId, now),
  );
  if (!context) return { kind: 'ignored', reason: 'comment_not_found' };
  if (context.comment.mergedIntoId) return { kind: 'ignored', reason: 'merged' };

  // Gộp (FR-148): chỉ đường TỰ ĐỘNG. Các bình luận chưa xử lý cùng khách + bài trong cửa sổ gộp thành MỘT lượt gắn vào bình luận
  // CUỐI nhóm; chữ các bình luận theo thời gian. Chạy lại không gộp thêm (đã `merged_into_id`).
  let mergedText: string | null = null;
  if (job.trigger === 'auto') {
    const group = await db.withJob(workspaceId, async (tx) =>
      mergeCommentGroup(
        tx,
        workspaceId,
        commentId,
        await getMergeWindowSeconds(tx, workspaceId, DEFAULT_MERGE_WINDOW_SECONDS),
      ),
    );
    if (group.mergedIds.length > 0) {
      mergedText = group.texts.join('\n');
      commentId = group.mainId;
      // Nạp lại SAU khi gộp: bình luận đã gộp không còn là "lượt trước" riêng (đã nằm trong văn bản gộp).
      context = await db.withJob(workspaceId, (tx) =>
        loadPipelineContext(tx, workspaceId, commentId, now),
      );
      if (!context) return { kind: 'ignored', reason: 'comment_not_found' };
    }
  }
  const comment = context.comment;

  // Đường TỰ ĐỘNG phải qua đúng hàm quyết định dùng chung với `ingest`/job quét (không điều kiện thứ hai).
  if (
    job.trigger === 'auto' &&
    !shouldAutoRunPipeline({
      ingestSource: comment.ingestSource as IngestSource,
      isOwn: comment.isOwn,
      deleted: comment.deleted,
      enabled: await config.pipelineEnabled(workspaceId),
    })
  ) {
    return { kind: 'ignored', reason: 'not_auto_eligible' };
  }

  const loaded = await db.withJob(workspaceId, async (tx) => {
    let resolution: EmbeddingResolution | undefined;
    try {
      resolution = await config.resolveEmbedding?.(tx);
    } catch (error) {
      config.onEmbeddingFailure?.(workspaceId, error); // không đoán model: toàn văn/trigram
    }
    const embedding = resolution?.config;
    return loadWorkspaceKnowledge({
      tx,
      workspaceId,
      version: context.kbVersion,
      productsEnabled: true,
      base: EMPTY_KNOWLEDGE,
      ...(embedding?.kind === 'ml' ? { embedder: embedding.embedder } : {}),
      ...(resolution?.revision != null ? { embeddingRevision: resolution.revision } : {}),
      onEmbeddingFailure: (error) => config.onEmbeddingFailure?.(workspaceId, error),
      ...(config.reranker ? { reranker: config.reranker } : {}),
      onRerankFailure: (error) => config.onRerankFailure?.(workspaceId, error),
    });
  });
  if (loaded?.embedding.state === 'mismatch') {
    config.onEmbeddingMismatch?.(workspaceId, loaded.embedding.mismatches);
  }
  const knowledge = loaded
    ? perCallKnowledge(db, workspaceId, loaded.bind, loaded.context.productNames)
    : EMPTY_KNOWLEDGE;
  const voices = loaded?.context.voices ?? {};
  const abbreviations = loaded?.context.abbreviations ?? {};

  // Ngữ cảnh hội thoại ĐÃ che PII (loader) → đầu vào của lõi; `selectCustomerContext` áp lại giới hạn ≤ 5 lượt / ≤ 3 câu bài khác / 7 ngày.
  const convo = {
    context: selectCustomerContext({
      thread: context.convo.turns,
      otherPosts: context.convo.otherQuestions,
      currentPostId: context.post.id,
      now,
    }),
    ...(context.convo.parentComment ? { parentComment: context.convo.parentComment } : {}),
    ...(context.convo.postCaption ? { postCaption: context.convo.postCaption } : {}),
    postProductIds: context.postProductIds,
    postProductNames: context.convo.postProductNames,
    state: parseConversationState(context.convo.stateRaw),
  };
  // FR-167: trần trả lời theo (khách, bài) trong 24 giờ.
  const replyCap = {
    count: context.customerPostReplies24h,
    max: context.settings.maxAiRepliesPerCustomerPost,
  };

  const factSlots = await loadFactSlots(config, workspaceId);

  return runCommentPipeline({
    db,
    workspaceId,
    commentId,
    turn: { limit: config.turnLimit, timeZone: DEFAULT_USAGE_TIME_ZONE },
    replyCapExceeded: evaluateReplyCap(replyCap) === 'exceeded',
    ...(draftSince ? { draftSince } : {}),
    input: {
      workspaceId,
      text: mergedText ?? comment.text,
      kbVersion: context.kbVersion ? `v${context.kbVersion.number}` : 'none',
      voice: { ...DEFAULT_VOICE, do: [], dont: [] },
      ...(Object.keys(voices).length > 0 ? { voices } : {}),
      autoSendEnabled: false,
      // Câu quá ngắn để nhận ngôn ngữ ("still available?"): kênh cố định → lượt khách trước → mặc định workspace; cùng đường với EVAL.
      replyLanguage: context.language.replyLanguage,
      previousLang: context.language.previousLang,
      ...(factSlots ? { factSlots } : {}),
      dict: createAbbreviationDict(abbreviations),
      thread: context.thread,
      convo,
      replyCap,
      attachmentTypes: comment.attachmentTypes,
      risks: {
        ...(comment.authorName
          ? {
              impersonation: {
                authorName: comment.authorName,
                pageNames: context.pageNames,
              },
            }
          : {}),
      },
    },
    deps: {
      extractor: config.llm.extractor,
      drafter: config.llm.drafter,
      knowledge,
      ...(config.llm.rewriter ? { rewriter: config.llm.rewriter } : {}),
    },
    persist: {
      commentId,
      kbVersionNumber: context.kbVersion?.number ?? null,
      model: null,
      promptVersion: null,
      traceId: null,
    },
  });
}

/**
 * Đường fact plan (ADR 017): cờ DB `cf.ai.fact_slots` TẮT (hoặc không truyền) → `undefined` và KHÔNG đọc `policy_facts` (đường cũ không đổi). BẬT → chỉ nạp chính sách ĐÃ DUYỆT
 * (`listApprovedPolicyFacts`; `policyFactsFromRows` còn bỏ mọi dòng không phải approved) — bản nháp không bao giờ vào.
 */
export async function loadFactSlots(
  config: Pick<PipelineJobConfig, 'db' | 'factSlotsEnabled'>,
  workspaceId: string,
): Promise<{ policy: PolicyFacts; stock: StockMode } | undefined> {
  if (!config.factSlotsEnabled || !(await config.factSlotsEnabled(workspaceId))) return undefined;
  const rows = await config.db.withJob(workspaceId, (tx) =>
    listApprovedPolicyFacts(tx, workspaceId),
  );
  return { policy: policyFactsFromRows(rows).policy, stock: { disclose: 'status', lowAt: null } };
}

/** Handler pg-boss của hàng đợi `pipeline` (batchSize 1). Lỗi tạm → ném để pg-boss thử lại (tối đa 3). */
export function createPipelineHandler(
  config: PipelineJobConfig & { logger: Pick<Logger, 'info' | 'error'> },
): BatchHandler {
  const runConfig: PipelineJobConfig = {
    ...config,
    onEmbeddingFailure: (workspaceId, error) =>
      config.logger.error(
        { workspaceId, reason: error instanceof Error ? error.name : 'unknown' },
        'Dịch vụ embedding gặp sự cố — lượt này chỉ tìm toàn văn/trigram',
      ),
    onEmbeddingMismatch: (workspaceId, mismatches) =>
      config.logger.error(
        { workspaceId, mismatches },
        'Model tìm kiếm khác dữ liệu — chạy kb:reembed (nhánh vector tắt cho lượt này)',
      ),
  };
  return async (jobs) => {
    for (const job of jobs) {
      const parsed = pipelineJobSchema.safeParse(job.data);
      if (!parsed.success) {
        config.logger.error({ jobId: job.id }, 'pipeline: dữ liệu job không hợp lệ');
        continue;
      }
      const outcome = await runPipelineJob(runConfig, parsed.data);
      config.logger.info(
        {
          workspaceId: parsed.data.workspaceId,
          commentId: parsed.data.commentId,
          outcome: outcome.kind,
        },
        'pipeline xong',
      );
    }
  };
}

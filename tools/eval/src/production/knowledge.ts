import {
  createDemoKnowledge,
  type Embedder,
  loadWorkspaceKnowledge,
  type Reranker,
  type TryKnowledge,
} from '@flow/ai';
import type { FlowDb, KbVersionRef } from '@flow/db';

/** EVAL KHÔNG có nguồn nền giả: workspace [EVAL] luôn có sản phẩm thật, nên nguồn nền không bao giờ được gọi — gọi tới = lỗi rõ. */
const noBase = (): never => {
  throw new Error(
    '[EVAL] không có kiến thức nền giả: workspace [EVAL] phải có sản phẩm/kiến thức thật.',
  );
};
const NO_BASE_KNOWLEDGE: TryKnowledge = {
  matchProducts: async () => noBase(),
  lookupProductFacts: async () => noBase(),
  searchKb: async () => noBase(),
};

/**
 * Kiến thức EVAL = ĐÚNG `loadWorkspaceKnowledge` của production trên workspace `[EVAL]` (phiên bản đã xuất bản, tìm lai vector bge-m3 + toàn
 * văn + trigram, sản phẩm/giá/tồn đọc từ DB). Giống worker: nạp MỘT lần rồi mỗi lần tìm kiếm mở một giao dịch ngắn (`bind(tx)`) — không giữ giao
 * dịch qua lời gọi LLM.
 */
export async function createProductionKnowledge(input: {
  db: FlowDb;
  workspaceId: string;
  version: KbVersionRef;
  embedder: Embedder;
  /** Rerank thật qua ml (nếu bật `ML_RERANK_ENABLED`); thiếu → cosine. */
  reranker?: Reranker;
  embeddingRevision?: number;
}): Promise<{
  knowledge: TryKnowledge;
  vectorFailures: () => number;
  rerankFailures: () => number;
}> {
  let failures = 0;
  let rerankFailures = 0;
  const loaded = await input.db.withJob(input.workspaceId, (tx) =>
    loadWorkspaceKnowledge({
      tx,
      workspaceId: input.workspaceId,
      version: input.version,
      productsEnabled: true,
      base: NO_BASE_KNOWLEDGE,
      embedder: input.embedder,
      ...(input.reranker ? { reranker: input.reranker } : {}),
      onRerankFailure: () => {
        rerankFailures += 1;
      },
      ...(input.embeddingRevision === undefined
        ? {}
        : { embeddingRevision: input.embeddingRevision }),
      onEmbeddingFailure: () => {
        failures += 1;
      },
    }),
  );
  if (!loaded) throw new Error('[EVAL] không có kiến thức để nạp (workspace trống).');
  if (loaded.embedding.state !== 'ok') {
    throw new Error(
      `[EVAL] nhánh vector không dùng được (${loaded.embedding.state}); không đo với kiến thức thiếu vector.`,
    );
  }
  const withTx = <T>(run: (knowledge: TryKnowledge) => Promise<T>) =>
    input.db.withJob(input.workspaceId, (tx) => run(loaded.bind(tx)));
  const knowledge: TryKnowledge = {
    productNames: loaded.context.productNames,
    matchProducts: (mentions) => withTx((k) => k.matchProducts(mentions)),
    lookupProductFacts: (ids) => withTx((k) => k.lookupProductFacts(ids)),
    searchKb: (query, context) => withTx((k) => k.searchKb(query, context)),
    lookupPlanProducts: (ids, options) =>
      withTx(async (k) => (k.lookupPlanProducts ? k.lookupPlanProducts(ids, options) : [])),
  };
  return { knowledge, vectorFailures: () => failures, rerankFailures: () => rerankFailures };
}

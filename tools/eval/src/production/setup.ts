import {
  createMlReranker,
  type Embedder,
  loadEmbeddingService,
  loadMlRerankerOptions,
  type Reranker,
  type TryKnowledge,
} from '@flow/ai';
import type { FlowDb } from '@flow/db';
import type { ShopFixture } from '../shop';
import { createProductionKnowledge } from './knowledge';
import {
  type EvalDistillConfig,
  type ProductionKnowledgeInfo,
  prepareProductionKnowledge,
} from './prepare';
import { assertDevDatabase } from './seed';

/**
 * Mở đường production cho EVAL từ biến môi trường (dùng chung `evaluate` và `retrieval`): kiểm DB là cf_dev/cf_test, nạp [EVAL] → đồng bộ → xuất
 * bản → dựng kiến thức. Cấu hình sai → ném lỗi rõ (nơi gọi in rồi thoát mã 2). Chỉ cf_dev/cf_test*.
 */
export type ProductionHandle = {
  info: ProductionKnowledgeInfo;
  db: FlowDb;
  embedder: Embedder;
  /** Rerank thật qua ml (nếu `ML_RERANK_ENABLED=true`); không có → `undefined` (quyết định liên quan bằng cosine). */
  reranker: Reranker | undefined;
  knowledge: TryKnowledge;
  vectorFailures: () => number;
  rerankFailures: () => number;
  close: () => Promise<void>;
};

export async function openProduction(
  shop: ShopFixture,
  env: Record<string, string | undefined>,
  distill?: EvalDistillConfig,
): Promise<ProductionHandle> {
  const adminUrl = env.DATABASE_ADMIN_URL ?? env.TEST_DATABASE_ADMIN_URL ?? '';
  const workerUrl = env.DATABASE_WORKER_URL ?? env.TEST_DATABASE_WORKER_URL ?? '';
  assertDevDatabase(adminUrl);
  if (!workerUrl) throw new Error('Thiếu DATABASE_WORKER_URL (role cf_worker).');
  const pg = (await import('pg')).default;
  const adminPool = new pg.Pool({ connectionString: adminUrl, max: 2 });
  let prepared: Awaited<ReturnType<typeof prepareProductionKnowledge>>;
  try {
    prepared = await prepareProductionKnowledge({
      adminPool,
      workerUrl,
      embeddingService: loadEmbeddingService(env),
      shop,
      ...(distill ? { distill } : {}),
    });
  } finally {
    await adminPool.end();
  }
  const embedder = prepared.embedding.embedder as Embedder;
  const rerankOptions = loadMlRerankerOptions(env);
  const reranker = rerankOptions ? createMlReranker(rerankOptions) : undefined;
  const built = await createProductionKnowledge({
    db: prepared.db,
    workspaceId: prepared.info.workspaceId,
    version: prepared.info.kbVersion,
    embedder,
    ...(reranker ? { reranker } : {}),
  });
  return {
    info: prepared.info,
    db: prepared.db,
    embedder,
    reranker,
    knowledge: built.knowledge,
    vectorFailures: built.vectorFailures,
    rerankFailures: built.rerankFailures,
    close: () => prepared.db.close(),
  };
}

export function describeProduction(info: ProductionKnowledgeInfo): string {
  return (
    `Kiến thức production: [EVAL] kb_version ${info.kbVersion.number}, embedder ${info.embeddingModel}; ` +
    `sản phẩm ${info.seed.products}, chính sách ${info.seed.policies}, FAQ ${info.seed.faqs}; ` +
    `đồng bộ ghi ${info.sync.chunksWritten} đoạn (giữ ${info.sync.chunksUnchanged}).` +
    (info.distill
      ? ` Chắt lọc: xét ${info.distill.considered} đoạn, gọi LLM ${info.distill.called}, đạt kiểm cứng ${info.distill.accepted}, ghi nháp ${info.distill.inserted}, duyệt ${info.distill.approved}, loại ${JSON.stringify(info.distill.rejected)}, $${info.distill.costUsd.toFixed(4)}.`
      : '')
  );
}

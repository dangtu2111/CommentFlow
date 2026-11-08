import { type Embedder, loadEmbeddingService, type TryKnowledge } from '@flow/ai';
import type { FlowDb } from '@flow/db';
import type { ShopFixture } from '../shop';
import { createProductionKnowledge } from './knowledge';
import { type ProductionKnowledgeInfo, prepareProductionKnowledge } from './prepare';
import { assertDevDatabase } from './seed';

/**
 * Mở đường production cho EVAL từ biến môi trường (dùng chung `evaluate` và `retrieval`): kiểm DB là cf_dev/cf_test, nạp [EVAL] → đồng bộ → xuất
 * bản → dựng kiến thức. Cấu hình sai → ném lỗi rõ (nơi gọi in rồi thoát mã 2). Chỉ cf_dev/cf_test*.
 */
export type ProductionHandle = {
  info: ProductionKnowledgeInfo;
  db: FlowDb;
  embedder: Embedder;
  knowledge: TryKnowledge;
  vectorFailures: () => number;
  close: () => Promise<void>;
};

export async function openProduction(
  shop: ShopFixture,
  env: Record<string, string | undefined>,
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
    });
  } finally {
    await adminPool.end();
  }
  const embedder = prepared.embedding.embedder as Embedder;
  const built = await createProductionKnowledge({
    db: prepared.db,
    workspaceId: prepared.info.workspaceId,
    version: prepared.info.kbVersion,
    embedder,
  });
  return {
    info: prepared.info,
    db: prepared.db,
    embedder,
    knowledge: built.knowledge,
    vectorFailures: built.vectorFailures,
    close: () => prepared.db.close(),
  };
}

export function describeProduction(info: ProductionKnowledgeInfo): string {
  return (
    `Kiến thức production: [EVAL] kb_version ${info.kbVersion.number}, embedder ${info.embeddingModel}; ` +
    `sản phẩm ${info.seed.products}, chính sách ${info.seed.policies}, FAQ ${info.seed.faqs}; ` +
    `đồng bộ ghi ${info.sync.chunksWritten} đoạn (giữ ${info.sync.chunksUnchanged}).`
  );
}

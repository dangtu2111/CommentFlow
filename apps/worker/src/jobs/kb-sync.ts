import {
  buildChunkRows,
  buildFaqDocuments,
  buildPolicyDocuments,
  buildProductDocuments,
  buildShopDocuments,
  classifyTopic,
  type EmbeddingConfig,
  type PolicyKind,
} from '@flow/ai';
import {
  type Database,
  deleteDraftChunks,
  type FlowDb,
  findOrCreateSyncSource,
  findSyncSource,
  KB_SYNC_PRODUCT_LIMIT,
  listDraftChunkState,
  listFaqItems,
  listPolicyItems,
  listProductsForSync,
  listShopProfiles,
  lockKbPublish,
  refreshDraftChunkMeta,
  type SyncSourceKind,
  setDraftChunkTopics,
  upsertDraftChunks,
} from '@flow/db';
import {
  AppError,
  type ChunkDocument,
  chunkDocument,
  type KbSyncJob,
  type KbTopic,
  kbSyncJobSchema,
} from '@flow/shared';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * Đồng bộ nguồn nhập tay (thông tin shop, chính sách, FAQ, sản phẩm) vào BẢN NHÁP kiến thức (KB-SYNC-DRAFT).
 * Một giao dịch `withJob` + khóa tư vấn dùng chung với `kb-publish` (không xuất bản giữa chừng đồng bộ). Cắt theo mục, embedding THẬT
 * theo model đang hoạt động ở DB (thiếu dịch vụ/model → lỗi rõ, KHÔNG sinh vector giả, KHÔNG ghi đoạn nửa vời), quét cài lệnh,
 * `metadata.topic` cho từng đoạn. Chạy lại không đổi gì → không ghi gì (nhờ `content_hash`). CHỈ ghi bản nháp; xuất bản do Owner bấm.
 */
export type KbSyncStats = {
  sources: number;
  chunksWritten: number;
  chunksUnchanged: number;
  chunksRemoved: number;
  productsTruncated: boolean;
};

export type KbSyncDeps = {
  /** Cấu hình embedding đang hoạt động (model ở DB + dịch vụ ml ở env). `off` → job từ chối. */
  resolveEmbedding: (tx: Database) => Promise<EmbeddingConfig>;
};

type SourcePlan = {
  kind: SyncSourceKind;
  title: string;
  documents: ChunkDocument[];
  topicOf: (doc: ChunkDocument) => KbTopic;
};

const TITLES: Record<SyncSourceKind, string> = {
  shop: 'Thông tin shop',
  policy: 'Chính sách cửa hàng',
  faq: 'Câu hỏi thường gặp',
  product: 'Sản phẩm',
};

async function loadPlans(
  tx: Database,
  workspaceId: string,
): Promise<{
  plans: SourcePlan[];
  productsTruncated: boolean;
}> {
  // Tuần tự: cùng một giao dịch/kết nối, không chạy song song (pg 9 sẽ bỏ cho phép).
  const policies = await listPolicyItems(tx, workspaceId);
  const faqs = await listFaqItems(tx, workspaceId);
  const shops = await listShopProfiles(tx, workspaceId);
  const products = await listProductsForSync(tx, workspaceId);
  const policyDocs = buildPolicyDocuments(
    policies.map((p) => ({
      id: p.id,
      kind: p.kind as PolicyKind,
      lang: p.lang === 'en' ? 'en' : 'vi',
      title: p.title,
      content: p.content,
    })),
    TITLES.policy,
  );
  const topicByKey = new Map(policyDocs.map((d) => [d.doc.key, d.topic]));
  const plans: SourcePlan[] = [
    {
      kind: 'policy',
      title: TITLES.policy,
      documents: policyDocs.map((d) => d.doc),
      topicOf: (doc) => topicByKey.get(doc.key) ?? 'other',
    },
    {
      kind: 'faq',
      title: TITLES.faq,
      documents: buildFaqDocuments(faqs, TITLES.faq),
      topicOf: (doc) => classifyTopic(doc.text, 'other'),
    },
    {
      kind: 'shop',
      title: TITLES.shop,
      documents: buildShopDocuments(shops, TITLES.shop),
      topicOf: () => 'other',
    },
    {
      kind: 'product',
      title: TITLES.product,
      documents: buildProductDocuments(products.rows, TITLES.product),
      topicOf: () => 'product_info',
    },
  ];
  return { plans, productsTruncated: products.truncated };
}

export async function runKbSync(
  tx: Database,
  job: KbSyncJob,
  deps: KbSyncDeps,
): Promise<KbSyncStats> {
  const { workspaceId } = job;
  await lockKbPublish(tx, workspaceId);
  const embedding = await deps.resolveEmbedding(tx);
  if (embedding.kind !== 'ml') {
    // Không đồng bộ khi chưa có embedding thật: đoạn không vector sẽ lệch với model hoạt động (FR-133) và không có bản giả.
    throw new AppError('CONFIG_INVALID', `Không đồng bộ kiến thức: ${embedding.describe.note}`);
  }
  const { plans, productsTruncated } = await loadPlans(tx, workspaceId);
  const stats: KbSyncStats = {
    sources: 0,
    chunksWritten: 0,
    chunksUnchanged: 0,
    chunksRemoved: 0,
    productsTruncated,
  };
  for (const plan of plans) {
    // Không tạo nguồn rỗng; nguồn đã có mà hết tài liệu → vẫn chạy để xóa đoạn cũ.
    const sourceId =
      plan.documents.length > 0
        ? await findOrCreateSyncSource(tx, workspaceId, plan.kind, plan.title)
        : await findSyncSource(tx, workspaceId, plan.kind);
    if (sourceId === null) continue;
    const drafts = plan.documents.flatMap((doc) => chunkDocument(doc));
    const topics: Array<{ chunkKey: string; topic: KbTopic }> = [];
    for (const doc of plan.documents) {
      const topic = plan.topicOf(doc);
      for (const draft of drafts) {
        if (draft.chunkKey.startsWith(`${doc.key}#`))
          topics.push({ chunkKey: draft.chunkKey, topic });
      }
    }
    // Lỗi giữa chừng ném lên → giao dịch `withJob` rollback toàn bộ (không để lại đoạn nửa vời).
    const existing = await listDraftChunkState(tx, workspaceId, sourceId);
    const built = await buildChunkRows({ drafts, existing, embedder: embedding.embedder });
    await upsertDraftChunks(tx, workspaceId, sourceId, built.rows);
    await refreshDraftChunkMeta(tx, workspaceId, sourceId, built.unchanged);
    stats.chunksRemoved += await deleteDraftChunks(tx, workspaceId, sourceId, built.removedKeys);
    await setDraftChunkTopics(tx, workspaceId, sourceId, topics);
    stats.sources += 1;
    stats.chunksWritten += built.rows.length;
    stats.chunksUnchanged += built.unchangedKeys.length;
  }
  return stats;
}

export function createKbSyncHandler(
  deps: KbSyncDeps & { db: FlowDb; logger: Logger },
): BatchHandler {
  return workspaceJob({
    db: deps.db,
    schema: kbSyncJobSchema,
    handler: async ({ tx, payload, jobId }) => {
      const stats = await runKbSync(tx, payload, deps);
      if (stats.productsTruncated) {
        deps.logger.warn(
          { workspaceId: payload.workspaceId, limit: KB_SYNC_PRODUCT_LIMIT },
          'kb-sync: sản phẩm vượt giới hạn, phần còn lại chưa vào bản nháp',
        );
      }
      // Chỉ số liệu, không nội dung kiến thức.
      deps.logger.info({ jobId, workspaceId: payload.workspaceId, ...stats }, 'kb-sync xong');
    },
  });
}

import type { MlEmbedderOptions } from '@flow/ai';
import {
  createEmbeddingResolver,
  defaultKbPublishOps,
  type EmbeddingConfig,
  type KbPublishOutcome,
  type KbSyncStats,
  runKbPublish,
  runKbSync,
} from '@flow/ai';
import { createDb, type FlowDb, getCurrentVersion, getEmbeddingState } from '@flow/db';
import type pg from 'pg';
import { EVAL_WORKSPACE } from '../eval-workspace';
import type { ShopFixture } from '../shop';
import { EVAL_USER, type SeedSummary, seedEvalWorkspace } from './seed';

/**
 * Chuẩn bị kiến thức cho EVAL ĐÚNG đường production: nạp shop file vào `[EVAL]` → `runKbSync` (cắt đoạn + vector bge-m3 thật) →
 * `runKbPublish` TỰ XUẤT BẢN (không người bấm; quyền Owner được thay bằng người dùng `[EVAL]`) → `kb_version`. Kết quả ghi vào báo cáo.
 * Thiếu dịch vụ ml / model embedding → lỗi rõ (không bản giả).
 */
export type ProductionKnowledgeInfo = {
  workspaceId: string;
  kbVersion: { id: string; number: number };
  embeddingModel: string;
  seed: SeedSummary;
  sync: KbSyncStats;
  publish: KbPublishOutcome;
};

export async function prepareProductionKnowledge(input: {
  adminPool: pg.Pool;
  workerUrl: string;
  embeddingService: MlEmbedderOptions | undefined;
  shop: ShopFixture;
}): Promise<{ info: ProductionKnowledgeInfo; db: FlowDb; embedding: EmbeddingConfig }> {
  const seed = await seedEvalWorkspace(input.adminPool, input.shop);
  const db = createDb({ connectionString: input.workerUrl, max: 4 });
  const resolver = createEmbeddingResolver({ service: input.embeddingService });
  const workspaceId = EVAL_WORKSPACE.id;
  const resolveEmbedding = async (tx: Parameters<typeof getEmbeddingState>[0]) =>
    (await resolver.resolve(() => getEmbeddingState(tx))).config;
  try {
    const sync = await db.withJob(workspaceId, (tx) =>
      runKbSync(tx, { workspaceId }, { resolveEmbedding }),
    );
    const publish = await db.withJob(workspaceId, (tx) =>
      runKbPublish(
        tx,
        {
          kind: 'publish',
          workspaceId,
          requestedBy: EVAL_USER.id,
          note: 'EVAL: tự xuất bản từ shop file',
        },
        // Quyền Owner thay bằng người dùng [EVAL]; mọi thao tác còn lại là đường production.
        { ...defaultKbPublishOps, isActiveOwner: async () => true },
      ),
    );
    const version = await db.withJob(workspaceId, (tx) => getCurrentVersion(tx, workspaceId));
    if (!version) throw new Error('[EVAL] chưa có phiên bản kiến thức sau khi xuất bản.');
    const embedding = await db.withJob(workspaceId, (tx) => resolveEmbedding(tx));
    if (embedding.kind !== 'ml') throw new Error(`Embedding tắt: ${embedding.describe.note}`);
    return {
      info: {
        workspaceId,
        kbVersion: version,
        embeddingModel: embedding.model,
        seed,
        sync,
        publish,
      },
      db,
      embedding,
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}

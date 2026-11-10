import type { MlEmbedderOptions } from '@flow/ai';
import {
  createEmbeddingResolver,
  createLlmClient,
  createLlmDistiller,
  type DistillStats,
  defaultKbPublishOps,
  type EmbeddingConfig,
  type KbPublishOutcome,
  type KbSyncStats,
  runKbDistill,
  runKbPublish,
  runKbSync,
} from '@flow/ai';
import {
  createDb,
  type FlowDb,
  getCurrentVersion,
  getEmbeddingState,
  insertDistilledFaqDrafts,
  listChunksToDistill,
  markChunksDistilled,
} from '@flow/db';
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
  /** Chỉ khi chạy `--distill`: số liệu chắt lọc + số nháp được duyệt (thay Owner bằng quyền quản trị, DB dev). */
  distill?: DistillStats & { approved: number };
};

/** Cấu hình chắt lọc cho EVAL (`--distill`): LLM thật qua LiteLLM; nháp đạt kiểm cứng được duyệt hàng loạt thay Owner (chỉ [EVAL], DB dev). */
export type EvalDistillConfig = { baseUrl: string; apiKey: string; model: string };

export async function prepareProductionKnowledge(input: {
  adminPool: pg.Pool;
  workerUrl: string;
  embeddingService: MlEmbedderOptions | undefined;
  shop: ShopFixture;
  distill?: EvalDistillConfig;
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
    let distill: (DistillStats & { approved: number }) | undefined;
    let syncAfter = sync;
    if (input.distill) {
      const cfg = input.distill;
      // Mỗi lượt đo nạp lại shop file (xóa FAQ cũ) nên phải chắt lọc lại từ đầu: bỏ dấu "đã chắt lọc" của đoạn [EVAL].
      await input.adminPool.query(
        "UPDATE cf.kb_chunks SET metadata = metadata - 'distill_hash' WHERE workspace_id = $1",
        [workspaceId],
      );
      const stats = await runKbDistill({
        workspaceId,
        distiller: createLlmDistiller({
          model: cfg.model,
          llm: createLlmClient({
            db: {
              withWorkspace: (id: string, fn: Parameters<typeof db.withJob>[1]) =>
                db.withJob(id, fn),
            } as unknown as Parameters<typeof createLlmClient>[0]['db'],
            baseUrl: cfg.baseUrl,
            apiKey: cfg.apiKey,
          }),
        }),
        ops: {
          listChunks: (limit) =>
            db.withJob(workspaceId, (tx) => listChunksToDistill(tx, workspaceId, limit)),
          insertDrafts: (items) =>
            db.withJob(workspaceId, (tx) => insertDistilledFaqDrafts(tx, workspaceId, items)),
          markDistilled: (chunks) =>
            db.withJob(workspaceId, (tx) => markChunksDistilled(tx, workspaceId, chunks)),
        },
      });
      // Thay Owner duyệt hàng loạt (bộ đo): quyền quản trị của DB dev, không đi qua đường web.
      const approved = await input.adminPool.query(
        "UPDATE cf.faq_items SET status = 'published', updated_at = now() WHERE workspace_id = $1 AND status = 'draft'",
        [workspaceId],
      );
      distill = { ...stats, approved: approved.rowCount ?? 0 };
      // Đồng bộ lại để FAQ vừa duyệt vào bản nháp kiến thức trước khi xuất bản.
      syncAfter = await db.withJob(workspaceId, (tx) =>
        runKbSync(tx, { workspaceId }, { resolveEmbedding }),
      );
    }
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
        sync: syncAfter,
        publish,
        ...(distill ? { distill } : {}),
      },
      db,
      embedding,
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}

import { type EmbeddingConfig, type KbSyncDeps, runKbSync } from '@flow/ai';
import { type FlowDb, KB_SYNC_PRODUCT_LIMIT } from '@flow/db';
import { kbSyncJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * Job `kb-sync` (KB-SYNC-DRAFT): bọc ngữ cảnh DB (`withJob`) quanh lõi dùng chung `runKbSync` ở `@flow/ai` (EVAL cũng dùng đúng lõi này).
 */
export { type KbSyncDeps, type KbSyncStats, runKbSync } from '@flow/ai';

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

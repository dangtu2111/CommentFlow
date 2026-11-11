import { type Distiller, type KbSyncDeps, runKbSync } from '@flow/ai';
import { type FlowDb, KB_SYNC_PRODUCT_LIMIT } from '@flow/db';
import { kbSyncJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { distillAfterSync } from './kb-distill';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * Job `kb-sync` (KB-SYNC-DRAFT): bọc ngữ cảnh DB (`withJob`) quanh lõi dùng chung `runKbSync` ở `@flow/ai` (EVAL cũng dùng đúng lõi này).
 */
export { type KbSyncDeps, type KbSyncStats, runKbSync } from '@flow/ai';

/** Bước chắt lọc sau đồng bộ (M3): chạy khi cờ `cf.ai.distill` của workspace BẬT và LLM đã cấu hình; thiếu LLM → không truyền `distill` (bước tắt, log rõ lúc khởi động). */
export type KbSyncDistill = {
  enabled: (workspaceId: string) => Promise<boolean>;
  distiller: Distiller;
};

export function createKbSyncHandler(
  deps: KbSyncDeps & { db: FlowDb; logger: Logger; distill?: KbSyncDistill },
): BatchHandler {
  const sync = workspaceJob({
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
  const distill = deps.distill;
  if (!distill) return sync;
  return async (jobs) => {
    await sync(jobs);
    // SAU khi giao dịch đồng bộ đã chốt: chắt lọc không giữ khóa đồng bộ.
    for (const job of jobs) {
      const parsed = kbSyncJobSchema.safeParse(job.data);
      if (parsed.success) {
        await distillAfterSync({
          db: deps.db,
          logger: deps.logger,
          distill,
          workspaceId: parsed.data.workspaceId,
        });
      }
    }
  };
}

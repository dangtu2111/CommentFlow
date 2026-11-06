import { type Embedder, type ReembedResult, reembedWorkspaceChunks } from '@flow/ai';
import {
  type Database,
  type FlowDb,
  listChunksToReembed,
  type ReembedChunk,
  type ReembedWrite,
  writeReembeddedChunks,
} from '@flow/db';
import { kbReembedJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * Tạo lại embedding khi đổi mô hình (FR-133, Q-PVH1). Một giao dịch `withJob` cho cả workspace; chạy lại an toàn (xong
 * rồi → 0 đoạn). Embedder tiêm vào: hiện chỉ bản mock (embedding thật = gap `KB-EMBED-LITELLM`), nên cờ `KB_REEMBED_ENABLED`
 * mặc định TẮT. Không ghi nội dung kiến thức vào log.
 */
export type KbReembedDeps = {
  embedder: Embedder;
  listChunks: (
    tx: Database,
    workspaceId: string,
    model: string,
    limit: number,
  ) => Promise<ReembedChunk[]>;
  writeChunks: (
    tx: Database,
    workspaceId: string,
    model: string,
    rows: ReembedWrite[],
  ) => Promise<number>;
};

export function runKbReembed(
  tx: Database,
  workspaceId: string,
  deps: KbReembedDeps,
): Promise<ReembedResult> {
  return reembedWorkspaceChunks({
    embedder: deps.embedder,
    ops: {
      list: (model, limit) => deps.listChunks(tx, workspaceId, model, limit),
      write: (model, rows) => deps.writeChunks(tx, workspaceId, model, rows),
    },
  });
}

export function createKbReembedHandler(deps: {
  db: FlowDb;
  logger: Logger;
  embedder: Embedder;
}): BatchHandler {
  return workspaceJob({
    db: deps.db,
    schema: kbReembedJobSchema,
    handler: async ({ tx, workspaceId, jobId }) => {
      const result = await runKbReembed(tx, workspaceId, {
        embedder: deps.embedder,
        listChunks: listChunksToReembed,
        writeChunks: writeReembeddedChunks,
      });
      deps.logger.info(
        { jobId, workspaceId, model: deps.embedder.model, ...result },
        'kb-reembed xong',
      );
    },
  });
}

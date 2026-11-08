import { defaultKbPublishOps, type KbPublishOps, runKbPublish } from '@flow/ai';
import type { FlowDb } from '@flow/db';
import { kbPublishJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/** Job `kb-publish` (FR-054): bọc `withJob` quanh lõi dùng chung `runKbPublish` ở `@flow/ai` (EVAL tự xuất bản `[EVAL]` qua đúng lõi này). */
export {
  defaultKbPublishOps,
  type KbPublishOps,
  type KbPublishOutcome,
  markDraftConflicts,
  runKbPublish,
} from '@flow/ai';

export function createKbPublishHandler(deps: {
  db: FlowDb;
  logger: Logger;
  ops?: KbPublishOps;
}): BatchHandler {
  return workspaceJob({
    db: deps.db,
    schema: kbPublishJobSchema,
    handler: async ({ tx, payload, jobId }) => {
      const result = await runKbPublish(tx, payload, deps.ops ?? defaultKbPublishOps);
      // Chỉ số liệu, không nội dung kiến thức.
      deps.logger.info(
        { jobId, workspaceId: payload.workspaceId, kind: payload.kind, ...result },
        'kb-publish xong',
      );
    },
  });
}

import {
  DEFAULT_MERGE_WINDOW_SECONDS,
  type FlowDb,
  listPendingPipelineComments,
  type PendingPipelineComment,
} from '@flow/db';
import { type IngestSource, type PipelineJob, shouldAutoRunPipeline } from '@flow/shared';
import type { Logger } from '../logger';

/**
 * Job quét `pipeline` (PIPE-ORCHESTRATOR lát E, Q-POR1/Q-POR7): mỗi 5 phút xếp lại bình luận kẹt `new` quá cửa sổ gộp + 1 phút mà
 * không có job, hoặc `processing` hết thuê quá 15 phút (job chết). KHÔNG xếp lại: bình luận backfill chưa từng có lượt (FR-011);
 * workspace đang dừng khẩn cấp (hàm DB bỏ qua → bình luận giữ `new`, bỏ dừng thì lần quét sau xử lý tiếp). Quyết định "có tự chạy
 * không" do ĐÚNG `shouldAutoRunPipeline` dùng chung với `ingest`; bình luận đã có lượt (nhân viên bấm) chạy `manual`.
 */
export const PIPELINE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
export const PIPELINE_PROCESSING_STUCK_SECONDS = 15 * 60;
export const PIPELINE_SWEEP_LIMIT = 200;

export type EnqueuePipeline = (job: PipelineJob) => Promise<void>;

export type PipelineSweepConfig = {
  db: FlowDb;
  enqueue: EnqueuePipeline;
  flagEnabled: boolean;
  allowedWorkspaceIds: readonly string[];
  logger: Pick<Logger, 'info' | 'error'>;
  list?: (db: FlowDb, workspaceIds: readonly string[]) => Promise<PendingPipelineComment[]>;
};

export type PipelineSweepResult = { enqueued: number; skipped: number; failed: number };

export async function runPipelineSweep(config: PipelineSweepConfig): Promise<PipelineSweepResult> {
  const result: PipelineSweepResult = { enqueued: 0, skipped: 0, failed: 0 };
  const list =
    config.list ??
    ((db, workspaceIds) =>
      db.withSystem((tx) =>
        listPendingPipelineComments(tx, {
          newAfterSeconds: DEFAULT_MERGE_WINDOW_SECONDS + 60,
          processingAfterSeconds: PIPELINE_PROCESSING_STUCK_SECONDS,
          workspaceIds,
          limit: PIPELINE_SWEEP_LIMIT,
        }),
      ));
  const rows = await list(config.db, config.allowedWorkspaceIds);
  for (const row of rows) {
    const auto = shouldAutoRunPipeline({
      workspaceId: row.workspaceId,
      ingestSource: row.ingestSource as IngestSource,
      isOwn: false,
      deleted: false,
      flagEnabled: config.flagEnabled,
      allowedWorkspaceIds: config.allowedWorkspaceIds,
    });
    // Không được tự chạy và chưa từng có lượt → không xếp (backfill không bao giờ vào đây).
    if (!auto && !row.hasTurn) {
      result.skipped += 1;
      continue;
    }
    try {
      await config.enqueue({
        workspaceId: row.workspaceId,
        commentId: row.commentId,
        trigger: auto ? 'auto' : 'manual',
      });
      result.enqueued += 1;
    } catch (error) {
      result.failed += 1;
      config.logger.error(
        { commentId: row.commentId, error: error instanceof Error ? error.name : 'unknown' },
        'pipeline-sweep: không xếp được job',
      );
    }
  }
  return result;
}

/** Chạy khi khởi động rồi mỗi 5 phút; trả hàm dừng. Lỗi một lượt không làm chết vòng lặp. */
export function startPipelineSweep(config: PipelineSweepConfig): () => void {
  const tick = () => {
    runPipelineSweep(config).then(
      (r) => config.logger.info(r, 'pipeline-sweep xong'),
      (error) =>
        config.logger.error(
          { error: error instanceof Error ? error.name : 'unknown' },
          'pipeline-sweep lỗi',
        ),
    );
  };
  tick();
  const timer = setInterval(tick, PIPELINE_SWEEP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

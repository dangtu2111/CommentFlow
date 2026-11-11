import {
  DISTILL_STEP,
  type Distiller,
  type DistillOps,
  type DistillStats,
  runKbDistill,
} from '@flow/ai';
import {
  type FlowDb,
  insertDistilledFaqDrafts,
  listChunksToDistill,
  markChunksDistilled,
} from '@flow/db';

/**
 * Chắt lọc kiến thức thô của MỘT workspace (M3, KB-DISTILL): mỗi thao tác DB một giao dịch `withJob` ngắn; cuộc gọi LLM nằm GIỮA các giao dịch
 * (không giữ khóa/kết nối DB trong lúc chờ LLM). Mỗi lần gọi ghi `ai_usage` (bước `distill`) qua lớp bọc LLM. Chỉ ghi nháp `draft`.
 */
export const KB_DISTILL_STEP = DISTILL_STEP;

export function distillOpsFor(db: FlowDb, workspaceId: string): DistillOps {
  return {
    listChunks: (limit) =>
      db.withJob(workspaceId, (tx) => listChunksToDistill(tx, workspaceId, limit)),
    insertDrafts: (items) =>
      db.withJob(workspaceId, (tx) => insertDistilledFaqDrafts(tx, workspaceId, items)),
    markDistilled: (chunks) =>
      db.withJob(workspaceId, (tx) => markChunksDistilled(tx, workspaceId, chunks)),
  };
}

export function runDistillForWorkspace(options: {
  db: FlowDb;
  workspaceId: string;
  distiller: Distiller;
  costCapUsd?: number;
}): Promise<DistillStats> {
  return runKbDistill({
    workspaceId: options.workspaceId,
    distiller: options.distiller,
    ops: distillOpsFor(options.db, options.workspaceId),
    ...(options.costCapUsd === undefined ? {} : { costCapUsd: options.costCapUsd }),
  });
}

type DistillLogger = {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
};

/**
 * Chắt lọc sau một lần đồng bộ: cờ `cf.ai.distill` của workspace tắt → không làm gì; lỗi (vd. LLM không khả dụng) CHỈ ghi log và không ném — đồng bộ đã chốt,
 * đoạn chưa đánh dấu sẽ được thử lại ở lần đồng bộ sau. Log chỉ số liệu, không nội dung kiến thức.
 */
export async function distillAfterSync(options: {
  db: FlowDb;
  logger: DistillLogger;
  distill: { enabled: (workspaceId: string) => Promise<boolean>; distiller: Distiller } | undefined;
  workspaceId: string;
}): Promise<void> {
  const { distill, workspaceId, logger } = options;
  if (!distill) return;
  try {
    if (!(await distill.enabled(workspaceId))) return;
    const stats = await runDistillForWorkspace({
      db: options.db,
      workspaceId,
      distiller: distill.distiller,
    });
    logger.info({ workspaceId, ...stats }, 'kb-distill xong');
    if (stats.stoppedByCap) {
      logger.warn(
        { workspaceId },
        'kb-distill: dừng vì chạm trần chi phí, phần còn lại để lần sau',
      );
    }
  } catch (error) {
    logger.warn(
      { workspaceId, error: error instanceof Error ? error.name : 'unknown' },
      'kb-distill lỗi, bỏ qua lần này',
    );
  }
}

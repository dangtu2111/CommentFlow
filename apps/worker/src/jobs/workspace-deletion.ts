import {
  type DueDeletion,
  type ExecuteDeletionResult,
  executeWorkspaceDeletion,
  type FlowDb,
  listDueWorkspaceDeletions,
} from '@flow/db';
import type { Logger } from '../logger';

/** Chu kỳ quét yêu cầu xóa đã tới hạn (mỗi 10 phút; hàm DB khóa dòng + kiểm lại nên chạy lặp/song song vẫn an toàn). */
export const WORKSPACE_DELETION_INTERVAL_MS = 10 * 60 * 1000;
/** Số workspace tối đa mỗi lượt (DB giới hạn 50). */
export const WORKSPACE_DELETION_BATCH = 10;

type Database = Parameters<Parameters<FlowDb['withSystem']>[0]>[0];

export type WorkspaceDeletionDeps = {
  db: Pick<FlowDb, 'withSystem' | 'withJob'>;
  logger: Pick<Logger, 'info' | 'error'>;
  /** Cờ `WORKSPACE_DELETE_ENABLED` (mặc định TẮT): tắt thì job không làm gì, không chạm DB. */
  enabled: boolean;
  /** Tiêm để test; mặc định gọi hàm DB thật. */
  list?: (tx: Database, limit: number) => Promise<DueDeletion[]>;
  execute?: (
    tx: Database,
    workspaceId: string,
    requestId: string,
  ) => Promise<ExecuteDeletionResult>;
};

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/**
 * WORKSPACE-DELETE (FR-094): xóa vĩnh viễn các workspace có yêu cầu `scheduled` đã tới hạn. Liệt kê ở ngữ cảnh trần
 * (`withSystem`), xóa từng workspace trong `withJob(workspaceId)` — một workspace lỗi không chặn workspace khác.
 * Hàm DB kiểm lại trạng thái trong chính giao dịch xóa (Owner hủy giữa chừng thì không xóa). Lỗi KHÔNG ném ra; log chỉ
 * có tên lỗi + id yêu cầu (không slug, không nội dung).
 */
export async function runWorkspaceDeletion(deps: WorkspaceDeletionDeps): Promise<void> {
  const { db, logger, enabled } = deps;
  if (!enabled) return;
  const list = deps.list ?? listDueWorkspaceDeletions;
  const execute = deps.execute ?? executeWorkspaceDeletion;

  let due: DueDeletion[];
  try {
    due = await db.withSystem((tx) => list(tx, WORKSPACE_DELETION_BATCH));
  } catch (error) {
    logger.error({ error: errorName(error) }, 'job xóa workspace: liệt kê yêu cầu tới hạn lỗi');
    return;
  }

  let deleted = 0;
  let skipped = 0;
  for (const { workspaceId, requestId } of due) {
    try {
      const outcome = await db.withJob(workspaceId, (tx) => execute(tx, workspaceId, requestId));
      if (outcome === 'deleted') deleted += 1;
      else skipped += 1;
    } catch (error) {
      logger.error({ error: errorName(error), requestId }, 'job xóa workspace: xóa lỗi');
    }
  }
  if (deleted > 0 || skipped > 0) {
    logger.info({ deleted, skipped }, 'đã xử lý yêu cầu xóa workspace tới hạn');
  }
}

/** Chạy ngay rồi định kỳ nếu cờ bật; trả hàm dừng (cờ tắt → hàm dừng rỗng). */
export function startWorkspaceDeletion(
  deps: WorkspaceDeletionDeps,
  intervalMs = WORKSPACE_DELETION_INTERVAL_MS,
): () => void {
  if (!deps.enabled) return () => undefined;
  void runWorkspaceDeletion(deps);
  const timer = setInterval(() => void runWorkspaceDeletion(deps), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

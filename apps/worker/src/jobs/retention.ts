import {
  AI_USAGE_DETAIL_DAYS,
  compactAiUsage,
  DATA_RETENTION_DAYS,
  type Database,
  type ExpiredExport,
  expireDataExports,
  type FlowDb,
  failStaleDataExports,
  purgeExpiredRetrievalLogs,
  purgeExpiredWebhookPayloads,
  purgeExpiredWorkspaceData,
  WEBHOOK_PAYLOAD_RETENTION_DAYS,
} from '@flow/db';
import { RETRIEVAL_LOG_RETENTION_DAYS } from '@flow/shared';
import type { ExportFileStore } from '../export-store';
import type { Logger } from '../logger';

/** Chu kỳ chạy job dọn (mỗi giờ; hàm DB idempotent nên nhiều worker chạy cùng lúc vẫn an toàn). */
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

export type ExportCleanupOps = {
  failStale: (tx: Database) => Promise<number>;
  expire: (tx: Database) => Promise<ExpiredExport[]>;
};

const defaultExportCleanupOps: ExportCleanupOps = {
  failStale: (tx) => failStaleDataExports(tx),
  expire: (tx) => expireDataExports(tx),
};

export type RetentionDeps = {
  db: Pick<FlowDb, 'withSystem'>;
  logger: Pick<Logger, 'info' | 'error'>;
  days?: number;
  /** Có kho tệp xuất (cờ DATA_EXPORT_ENABLED bật) → dọn yêu cầu xuất kẹt và xóa tệp hết hạn (FR-094). */
  exportStore?: ExportFileStore;
  exportOps?: ExportCleanupOps;
};

/** FR-094: yêu cầu xuất kẹt → failed; yêu cầu hết hạn → expired rồi xóa tệp. Không ném lỗi, log chỉ tên lỗi/số lượng. */
async function cleanupDataExports({
  db,
  logger,
  exportStore,
  exportOps = defaultExportCleanupOps,
}: RetentionDeps): Promise<void> {
  if (!exportStore) return;
  try {
    const stale = await db.withSystem((tx) => exportOps.failStale(tx));
    if (stale > 0) logger.info({ stale }, 'đã đánh dấu lỗi các yêu cầu xuất dữ liệu bị kẹt');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'job dọn yêu cầu xuất kẹt lỗi',
    );
  }
  try {
    const expired = await db.withSystem((tx) => exportOps.expire(tx));
    for (const item of expired) {
      // Một tệp xóa lỗi không bỏ qua các tệp còn lại.
      await exportStore
        .remove(item.fileKey)
        .catch((error: unknown) =>
          logger.error(
            { error: error instanceof Error ? error.name : 'unknown' },
            'xóa một tệp xuất hết hạn lỗi',
          ),
        );
    }
    if (expired.length > 0) logger.info({ expired: expired.length }, 'đã xóa tệp xuất hết hạn');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'job xóa tệp xuất hết hạn lỗi',
    );
  }
}

/**
 * Dọn dữ liệu quá hạn, mỗi loại độc lập (loại này lỗi không chặn loại kia):
 *  - WEBHOOK-PAYLOAD-RETENTION: payload sự kiện webhook cũ hơn 14 ngày (chứa tên/nội dung khách) + dấu xóa cũ;
 *  - RETRIEVAL-LOG (FR-134): nhật ký tìm kiếm cũ hơn 90 ngày;
 *  - RETENTION-JOB (FR-126): bình luận/nháp AI/khách tiềm năng cũ hơn 12 tháng; ai_usage cũ hơn 90 ngày gộp theo ngày.
 * Chạy ở ngữ cảnh trần (`withSystem`). Lỗi KHÔNG ném ra (không làm sập worker, lần sau chạy lại); log chỉ có số lượng/tên lỗi.
 */
export async function runRetention(deps: RetentionDeps): Promise<void> {
  const { db, logger, days } = deps;
  try {
    const result = await db.withSystem((tx) =>
      purgeExpiredWebhookPayloads(tx, days ?? WEBHOOK_PAYLOAD_RETENTION_DAYS),
    );
    if (result.payloads > 0 || result.tombstones > 0) {
      logger.info(result, 'đã dọn payload webhook/dấu xóa quá hạn');
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'job dọn payload webhook lỗi',
    );
  }
  try {
    const retrievalLogs = await db.withSystem((tx) =>
      purgeExpiredRetrievalLogs(tx, RETRIEVAL_LOG_RETENTION_DAYS),
    );
    if (retrievalLogs > 0) {
      logger.info({ retrievalLogs }, 'đã dọn nhật ký tìm kiếm quá hạn');
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'job dọn nhật ký tìm kiếm lỗi',
    );
  }
  try {
    const purged = await db.withSystem((tx) => purgeExpiredWorkspaceData(tx, DATA_RETENTION_DAYS));
    if (purged.comments > 0 || purged.drafts > 0 || purged.leads > 0) {
      logger.info(purged, 'đã xóa dữ liệu workspace quá thời hạn lưu');
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'job xóa dữ liệu quá thời hạn lưu lỗi',
    );
  }
  try {
    const aiUsageCompacted = await db.withSystem((tx) => compactAiUsage(tx, AI_USAGE_DETAIL_DAYS));
    if (aiUsageCompacted > 0) {
      logger.info({ aiUsageCompacted }, 'đã gộp ai_usage cũ theo ngày');
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'job gộp ai_usage lỗi',
    );
  }
  await cleanupDataExports(deps);
}

/** Chạy ngay rồi định kỳ; trả hàm dừng. Bộ đếm giờ `unref` để không giữ tiến trình sống. */
export function startRetention(
  deps: RetentionDeps,
  intervalMs = RETENTION_INTERVAL_MS,
): () => void {
  void runRetention(deps);
  const timer = setInterval(() => void runRetention(deps), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

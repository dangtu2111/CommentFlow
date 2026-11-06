import {
  AI_USAGE_DETAIL_DAYS,
  compactAiUsage,
  DATA_RETENTION_DAYS,
  type FlowDb,
  purgeExpiredRetrievalLogs,
  purgeExpiredWebhookPayloads,
  purgeExpiredWorkspaceData,
  WEBHOOK_PAYLOAD_RETENTION_DAYS,
} from '@flow/db';
import { RETRIEVAL_LOG_RETENTION_DAYS } from '@flow/shared';
import type { Logger } from '../logger';

/** Chu kỳ chạy job dọn (mỗi giờ; hàm DB idempotent nên nhiều worker chạy cùng lúc vẫn an toàn). */
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

export type RetentionDeps = {
  db: Pick<FlowDb, 'withSystem'>;
  logger: Pick<Logger, 'info' | 'error'>;
  days?: number;
};

/**
 * Dọn dữ liệu quá hạn, mỗi loại độc lập (loại này lỗi không chặn loại kia):
 *  - WEBHOOK-PAYLOAD-RETENTION: payload sự kiện webhook cũ hơn 14 ngày (chứa tên/nội dung khách) + dấu xóa cũ;
 *  - RETRIEVAL-LOG (FR-134): nhật ký tìm kiếm cũ hơn 90 ngày;
 *  - RETENTION-JOB (FR-126): bình luận/nháp AI/khách tiềm năng cũ hơn 12 tháng; ai_usage cũ hơn 90 ngày gộp theo ngày.
 * Chạy ở ngữ cảnh trần (`withSystem`). Lỗi KHÔNG ném ra (không làm sập worker, lần sau chạy lại); log chỉ có số lượng/tên lỗi.
 */
export async function runRetention({ db, logger, days }: RetentionDeps): Promise<void> {
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

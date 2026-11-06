import { sql } from 'drizzle-orm';
import type { Database } from './client';
import {
  AI_USAGE_DETAIL_DAYS,
  DATA_RETENTION_DAYS,
  MIN_AI_USAGE_DETAIL_DAYS,
  MIN_DATA_RETENTION_DAYS,
} from './retention-policy';

/** Số ngày giữ payload sự kiện webhook (chủ dự án quyết 05/11/2026). */
export const WEBHOOK_PAYLOAD_RETENTION_DAYS = 14;

/**
 * Dọn payload sự kiện webhook cũ hơn `days` ngày (payload chứa tên/nội dung khách) + dấu xóa cũ (migration 0026).
 * CHỈ gọi trong `db.withSystem(...)` (ngữ cảnh trần): hàm DEFINER từ chối mọi ngữ cảnh khác. Chạy lại an toàn.
 */
export async function purgeExpiredWebhookPayloads(
  tx: Database,
  days: number = WEBHOOK_PAYLOAD_RETENTION_DAYS,
): Promise<{ payloads: number; tombstones: number }> {
  const result = await tx.execute<{ payloads: number; tombstones: number }>(
    sql`SELECT payloads, tombstones FROM cf.purge_expired_webhook_payloads(${days}::integer)`,
  );
  const row = result.rows[0];
  return { payloads: row?.payloads ?? 0, tombstones: row?.tombstones ?? 0 };
}

/**
 * RETENTION-JOB (FR-126, migration 0053): xóa bình luận / nháp AI / khách tiềm năng quá hạn (mặc định 365 ngày).
 * CHỈ gọi trong `db.withSystem(...)` bằng kết nối cf_worker. Mỗi lần xóa tối đa 5000 dòng/loại: còn tồn đọng thì
 * lần chạy sau xóa tiếp. KHÔNG đụng nhật ký kiểm toán/hóa đơn.
 */
export async function purgeExpiredWorkspaceData(
  tx: Database,
  days: number = DATA_RETENTION_DAYS,
): Promise<{ comments: number; drafts: number; leads: number }> {
  assertMinDays(days, MIN_DATA_RETENTION_DAYS);
  const result = await tx.execute<{
    purged_comments: number;
    purged_drafts: number;
    purged_leads: number;
  }>(
    sql`SELECT purged_comments, purged_drafts, purged_leads FROM cf.purge_expired_workspace_data(${days}::integer)`,
  );
  const row = result.rows[0];
  return {
    comments: row?.purged_comments ?? 0,
    drafts: row?.purged_drafts ?? 0,
    leads: row?.purged_leads ?? 0,
  };
}

/**
 * Gộp `ai_usage` cũ hơn `days` ngày (mặc định 90) thành bản theo ngày `ai_usage_daily`; trả số dòng chi tiết đã gộp.
 * CHỈ gọi trong `db.withSystem(...)` bằng kết nối cf_worker. Tối đa 20000 dòng/lần, idempotent.
 */
export async function compactAiUsage(
  tx: Database,
  days: number = AI_USAGE_DETAIL_DAYS,
): Promise<number> {
  assertMinDays(days, MIN_AI_USAGE_DETAIL_DAYS);
  const result = await tx.execute<{ compacted: number }>(
    sql`SELECT cf.compact_ai_usage(${days}::integer) AS compacted`,
  );
  return result.rows[0]?.compacted ?? 0;
}

function assertMinDays(days: number, floor: number): void {
  if (!Number.isInteger(days) || days < floor) {
    throw new RangeError(`retention days must be an integer >= ${floor}`);
  }
}

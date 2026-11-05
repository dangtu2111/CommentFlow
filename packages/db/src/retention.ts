import { sql } from 'drizzle-orm';
import type { Database } from './client';

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

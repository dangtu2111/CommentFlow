import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Ghi sự kiện webhook và rải theo kênh (migration 0022, ADR 007 §4). CHỈ gọi trong `db.withSystem(...)` (ngữ cảnh trần):
 * hàm DEFINER từ chối mọi ngữ cảnh khác. Route web đã kiểm chữ ký TRƯỚC khi gọi.
 */
export type RecordWebhookEventInput = {
  platform: 'facebook' | 'instagram' | 'tiktok';
  /** Page/IG ID của nền tảng (`entry.id`). */
  pageExternalId: string;
  eventHash: string;
  /** Sự kiện đã chuẩn hóa/cắt từ thân webhook (có thể chứa tên khách → chỉ Owner/hệ thống đọc được). */
  payload: unknown;
};

export type RecordedWebhookEvent = { eventId: string; workspaceId: string };

/** Trả các dòng MỚI theo workspace (cần enqueue `ingest`); gửi lại/chưa map → mảng rỗng. */
export async function recordWebhookEvent(
  tx: Database,
  input: RecordWebhookEventInput,
): Promise<RecordedWebhookEvent[]> {
  const result = await tx.execute<{ event_id: string; event_workspace_id: string }>(
    sql`SELECT event_id, event_workspace_id FROM cf.record_webhook_event(${input.platform}, ${input.pageExternalId}, ${input.eventHash}, ${JSON.stringify(input.payload)}::jsonb)`,
  );
  return result.rows.map((row) => ({ eventId: row.event_id, workspaceId: row.event_workspace_id }));
}

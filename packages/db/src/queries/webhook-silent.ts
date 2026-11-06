import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/** Cửa sổ nhìn lại của cảnh báo webhook im lặng (QP3). Payload webhook bị dọn sau 14 ngày nên luôn còn dữ liệu. */
export const WEBHOOK_SILENT_WINDOW_HOURS = 24;

export type WebhookSilentChannel = { id: string; name: string };

/**
 * Kênh "webhook im lặng" (FR-023, docs/08 §3): đã kết nối và đăng ký webhook, nhưng trong 24 giờ qua quét bù (`payload.source =
 * 'polling'`) thấy bình luận mà webhook chưa báo, và chưa có sự kiện webhook nào đến SAU lần đó (webhook hồi phục → hết cảnh báo).
 * `backfill` không tính. CHỈ ĐỌC trong `withActor`: RLS của `webhook_events` chỉ cho Owner đọc → Staff nhận rỗng.
 */
export async function listWebhookSilentChannels(
  tx: Database,
  workspaceId: string,
): Promise<WebhookSilentChannel[]> {
  const result = await tx.execute<WebhookSilentChannel>(sql`
    SELECT ch.id, ch.name
      FROM cf.channels ch
     WHERE ch.workspace_id = ${workspaceId}::uuid
       AND ch.platform = 'facebook'
       AND ch.status = 'connected'
       AND ch.webhook_subscribed
       AND EXISTS (
         SELECT 1 FROM cf.webhook_events p
          WHERE p.workspace_id = ch.workspace_id
            AND p.platform = ch.platform
            AND p.payload ->> 'source' = 'polling'
            AND p.payload ->> 'channelExternalId' = ch.external_id
            AND p.created_at > now() - make_interval(hours => ${WEBHOOK_SILENT_WINDOW_HOURS})
            AND NOT EXISTS (
              SELECT 1 FROM cf.webhook_events w
               WHERE w.workspace_id = ch.workspace_id
                 AND w.platform = ch.platform
                 AND w.payload ->> 'channelExternalId' = ch.external_id
                 AND w.payload ->> 'source' IS NULL
                 AND w.created_at > p.created_at
            )
       )
     ORDER BY ch.name, ch.id`);
  return result.rows;
}

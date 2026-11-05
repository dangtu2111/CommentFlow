import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import type { InboxPlatform } from './inbox';

/**
 * Danh sách kênh của workspace cho trang Cài đặt → Kênh (FR-012). CHỈ ĐỌC, cột tường minh (không bao giờ đọc token —
 * `cf_app` cũng không có quyền cột đó); gọi trong `withActor` (RLS: chỉ thành viên đang hoạt động thấy kênh).
 */
export type ChannelListItem = {
  id: string;
  name: string;
  platform: InboxPlatform;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  webhookSubscribed: boolean;
};

export async function listChannels(tx: Database, workspaceId: string): Promise<ChannelListItem[]> {
  const result = await tx.execute<{
    id: string;
    name: string;
    platform: InboxPlatform;
    status: ChannelListItem['status'];
    webhook_subscribed: boolean;
  }>(sql`
    SELECT ch.id, ch.name, ch.platform, ch.status, ch.webhook_subscribed
      FROM cf.channels ch
     WHERE ch.workspace_id = ${workspaceId}::uuid
     ORDER BY ch.name, ch.id`);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    status: row.status,
    webhookSubscribed: row.webhook_subscribed,
  }));
}

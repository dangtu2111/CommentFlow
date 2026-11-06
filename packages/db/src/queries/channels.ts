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
  replyLanguage: 'auto' | 'vi' | 'en';
};

export async function listChannels(tx: Database, workspaceId: string): Promise<ChannelListItem[]> {
  const result = await tx.execute<{
    id: string;
    name: string;
    platform: InboxPlatform;
    status: ChannelListItem['status'];
    webhook_subscribed: boolean;
    reply_language: ChannelListItem['replyLanguage'];
  }>(sql`
    SELECT ch.id, ch.name, ch.platform, ch.status, ch.webhook_subscribed, ch.reply_language
      FROM cf.channels ch
     WHERE ch.workspace_id = ${workspaceId}::uuid
     ORDER BY ch.name, ch.id`);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    status: row.status,
    webhookSubscribed: row.webhook_subscribed,
    replyLanguage: row.reply_language,
  }));
}

/**
 * Đổi ngôn ngữ trả lời của một kênh (FR-120). Gọi trong `withActor`: RLS + trigger chỉ cho Owner đổi `name`/
 * `reply_language` (ch-rls.int.test.ts); kênh ngoài workspace → 0 dòng → `false`. Không đổi cột nào khác.
 */
export async function setChannelReplyLanguage(
  tx: Database,
  workspaceId: string,
  channelId: string,
  language: ChannelListItem['replyLanguage'],
): Promise<boolean> {
  const result = await tx.execute<{ id: string }>(sql`
    UPDATE cf.channels SET reply_language = ${language}
     WHERE id = ${channelId}::uuid AND workspace_id = ${workspaceId}::uuid
    RETURNING id`);
  return result.rows.length > 0;
}

import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import type { InboxPlatform } from './inbox';

/**
 * Kênh cần chú ý cho banner hệ thống (FR-012): `expired` (token hết hạn), `revoked` (mất quyền/ngắt), `error`.
 * CHỈ ĐỌC; gọi trong `withActor` (RLS: chỉ thành viên đang hoạt động thấy kênh của workspace).
 */
export type ChannelAlertStatus = 'expired' | 'revoked' | 'error';
export type ChannelAlert = {
  id: string;
  name: string;
  platform: InboxPlatform;
  status: ChannelAlertStatus;
};

export async function listChannelAlerts(
  tx: Database,
  workspaceId: string,
): Promise<ChannelAlert[]> {
  const result = await tx.execute<ChannelAlert>(sql`
    SELECT ch.id, ch.name, ch.platform, ch.status
      FROM cf.channels ch
     WHERE ch.workspace_id = ${workspaceId}::uuid
       AND ch.status IN ('expired', 'revoked', 'error')
     ORDER BY ch.name, ch.id`);
  return result.rows;
}

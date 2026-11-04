import {
  countCommentsByTab,
  eq,
  type InboxChannel,
  type InboxPage,
  type InboxTab,
  listComments,
  listInboxChannels,
  schema,
} from '@flow/db/runtime';
import type { InboxView } from '../lib/inbox-filters';
import { getDb } from './db';

export type InboxData = {
  page: InboxPage;
  counts: Record<InboxTab, number>;
  channels: InboxChannel[];
  timeZone: string;
};

/**
 * Dữ liệu trang Bình luận trong MỘT giao dịch `withActor` (RLS: chỉ thành viên đang hoạt động của workspace).
 * `workspaceId`/`userId` lấy từ `requireAppUser`, không từ URL. Số lượng tab áp cùng bộ lọc (trừ tab) với danh sách.
 */
export async function loadInbox(
  workspaceId: string,
  userId: string,
  view: InboxView,
): Promise<InboxData> {
  const filter = {
    tab: view.tab,
    sort: view.sort,
    cursor: view.cursor,
    ...(view.platform ? { platform: view.platform } : {}),
    ...(view.channelId ? { channelId: view.channelId } : {}),
    ...(view.adsOnly ? { adsOnly: true } : {}),
    ...(view.search ? { search: view.search } : {}),
  };
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const [page, counts, channels, workspace] = await Promise.all([
      listComments(tx, workspaceId, filter),
      countCommentsByTab(tx, workspaceId, filter),
      listInboxChannels(tx, workspaceId),
      tx
        .select({ timezone: schema.workspaces.timezone })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId)),
    ]);
    return { page, counts, channels, timeZone: workspace[0]?.timezone ?? 'UTC' };
  });
}

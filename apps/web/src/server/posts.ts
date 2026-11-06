import {
  eq,
  type InboxChannel,
  listInboxChannels,
  listPosts,
  type PostsPage,
  schema,
} from '@flow/db/runtime';
import { POSTS_PAGE_SIZE, type PostsView } from '../lib/posts-filters';
import { getDb } from './db';

export type PostsData = { page: PostsPage; channels: InboxChannel[]; timeZone: string };

/**
 * Dữ liệu trang Bài viết (FR-060) trong MỘT giao dịch `withActor` (RLS: chỉ thành viên đang hoạt động).
 * `workspaceId`/`userId` lấy từ `requireAppUser`, không từ URL.
 */
export async function loadPosts(
  workspaceId: string,
  userId: string,
  view: PostsView,
): Promise<PostsData> {
  const filter = {
    sort: view.sort,
    page: view.page,
    limit: POSTS_PAGE_SIZE,
    ...(view.platform ? { platform: view.platform } : {}),
    ...(view.channelId ? { channelId: view.channelId } : {}),
    ...(view.kind ? { kind: view.kind } : {}),
    ...(view.search ? { search: view.search } : {}),
  };
  return getDb().withActor(workspaceId, userId, async (tx) => {
    const [page, channels, workspace] = await Promise.all([
      listPosts(tx, workspaceId, filter),
      listInboxChannels(tx, workspaceId),
      tx
        .select({ timezone: schema.workspaces.timezone })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId)),
    ]);
    return { page, channels, timeZone: workspace[0]?.timezone ?? 'UTC' };
  });
}

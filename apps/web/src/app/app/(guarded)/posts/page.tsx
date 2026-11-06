import { getTranslations } from 'next-intl/server';
import { PostConfigPlaceholder } from '../../../../components/posts/post-config-placeholder';
import { PostsHeader } from '../../../../components/posts/posts-header';
import { PostsList } from '../../../../components/posts/posts-list';
import { PostsTabs } from '../../../../components/posts/posts-tabs';
import { PostsToolbar } from '../../../../components/posts/posts-toolbar';
import {
  POSTS_PAGE_SIZE,
  parsePostsSearchParams,
  postsPageCount,
} from '../../../../lib/posts-filters';
import { loadPosts } from '../../../../server/posts';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('posts');
  return { title: t('title') };
}

/**
 * Trang Bài viết (FR-060): chỉ đọc. Bộ lọc là tham số URL (GET form) nên dùng được khi tắt JavaScript.
 * Workspace/người dùng lấy từ `requireAppUser`, không từ URL. Giao diện Tailwind (ADR 013, Q-TWKP1).
 */
export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await requireAppUser({});
  const [t, params] = await Promise.all([getTranslations('posts'), searchParams]);
  const view = parsePostsSearchParams(params);

  let data: Awaited<ReturnType<typeof loadPosts>> | null = null;
  try {
    data = await loadPosts(workspace.id, user.id, view);
  } catch {
    // Không lộ chi tiết lỗi ra giao diện; hiện thông báo chung.
    data = null;
  }
  if (!data) {
    return (
      <main className="app-page" role="alert">
        <div className="tw">
          <h1 className="font-headline-md text-headline-md text-on-surface">{t('error.title')}</h1>
          <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
            {t('error.body')}
          </p>
        </div>
      </main>
    );
  }

  const { page, channels, timeZone } = data;
  const filtered = Boolean(view.platform || view.channelId || view.kind || view.search);
  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        <div className="space-y-space-lg">
          <PostsHeader count={page.total} />
          <div className="space-y-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
            <PostsTabs view={view} />
            <PostsToolbar view={view} channels={channels} />
          </div>
          <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
            <div className="lg:col-span-7">
              {page.items.length === 0 ? (
                <div className="rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
                  <h2 className="font-title-md text-title-md text-on-surface">
                    {filtered || view.page > 1 ? t('empty.filteredTitle') : t('empty.title')}
                  </h2>
                  <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
                    {filtered || view.page > 1 ? t('empty.filteredBody') : t('empty.body')}
                  </p>
                </div>
              ) : (
                <PostsList
                  view={view}
                  items={page.items}
                  total={page.total}
                  pageCount={postsPageCount(page.total, POSTS_PAGE_SIZE)}
                  timeZone={timeZone}
                />
              )}
            </div>
            <PostConfigPlaceholder />
          </div>
        </div>
      </div>
    </main>
  );
}

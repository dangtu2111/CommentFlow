import { getTranslations } from 'next-intl/server';
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
 * Workspace/người dùng lấy từ `requireAppUser`, không từ URL.
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
      <main className="posts" role="alert">
        <h1>{t('error.title')}</h1>
        <p>{t('error.body')}</p>
      </main>
    );
  }

  const { page, channels, timeZone } = data;
  const filtered = Boolean(view.platform || view.channelId || view.kind || view.search);
  return (
    <main className="posts">
      <header className="posts-header">
        <nav className="posts-breadcrumb" aria-label={t('breadcrumb.label')}>
          <span>{t('breadcrumb.operations')}</span>
          <span aria-hidden="true">›</span>
          <span>{t('breadcrumb.content')}</span>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{t('breadcrumb.current')}</span>
        </nav>
        <div className="posts-title-row">
          <h1>{t('heading')}</h1>
          <span className="posts-total">{t('count', { count: page.total })}</span>
        </div>
        <p className="muted">{t('subtitle')}</p>
      </header>
      <PostsTabs view={view} />
      <section className="posts-panel">
        <PostsToolbar view={view} channels={channels} />
        {page.items.length === 0 ? (
          <div className="inbox-empty">
            <h2>{filtered || view.page > 1 ? t('empty.filteredTitle') : t('empty.title')}</h2>
            <p>{filtered || view.page > 1 ? t('empty.filteredBody') : t('empty.body')}</p>
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
      </section>
    </main>
  );
}

import { getTranslations } from 'next-intl/server';
import { PostsList } from '../../../../components/posts/posts-list';
import { PostsTabs } from '../../../../components/posts/posts-tabs';
import { PostsToolbar } from '../../../../components/posts/posts-toolbar';
import { Card } from '../../../../components/ui/card';
import { Chip } from '../../../../components/ui/chip';
import { Breadcrumb } from '../../../../components/ui/page-header';
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
      <main className="app-page" role="alert">
        <h1 className="page-title">{t('error.title')}</h1>
        <p>{t('error.body')}</p>
      </main>
    );
  }

  const { page, channels, timeZone } = data;
  const filtered = Boolean(view.platform || view.channelId || view.kind || view.search);
  return (
    <main className="app-page app-page-wide">
      <header className="posts-header">
        <Breadcrumb
          label={t('breadcrumb.label')}
          parents={[t('breadcrumb.operations'), t('breadcrumb.content')]}
          current={t('breadcrumb.current')}
        />
        <div className="posts-title-row">
          <h1 className="page-title">{t('heading')}</h1>
          <Chip tone="info">{t('count', { count: page.total })}</Chip>
        </div>
        <p className="page-subtitle">{t('subtitle')}</p>
      </header>
      <Card className="posts-filter">
        <PostsTabs view={view} />
        <PostsToolbar view={view} channels={channels} />
      </Card>
      {page.items.length === 0 ? (
        <Card className="inbox-empty">
          <h2>{filtered || view.page > 1 ? t('empty.filteredTitle') : t('empty.title')}</h2>
          <p>{filtered || view.page > 1 ? t('empty.filteredBody') : t('empty.body')}</p>
        </Card>
      ) : (
        <PostsList
          view={view}
          items={page.items}
          total={page.total}
          pageCount={postsPageCount(page.total, POSTS_PAGE_SIZE)}
          timeZone={timeZone}
        />
      )}
    </main>
  );
}

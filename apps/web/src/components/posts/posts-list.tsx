import { isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { buildPostsHref, POSTS_PAGE_SIZE, type PostsView } from '../../lib/posts-filters';
import { postsPageWindow } from '../../lib/posts-pagination';

export type PostsListItem = {
  id: string;
  channelName: string;
  platform: string;
  externalId: string;
  message: string | null;
  permalink: string | null;
  isAd: boolean;
  createdTime: Date | null;
  commentCount: number;
  pendingCount: number;
};

/** Chỉ cho mở liên kết bài gốc nếu là http(s) (dữ liệu nền tảng, không tin tuyệt đối). */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Danh sách bài (FR-060). Chỉ hiển thị dữ liệu thật; văn bản thuần (React tự thoát HTML), cắt 3 dòng bằng CSS.
 * Bài chưa đồng bộ nội dung (`message` trống, chờ POST-HYDRATE) hiện mã bài thay cho tiêu đề.
 */
export async function PostsList({
  view,
  items,
  total,
  pageCount,
  timeZone,
}: {
  view: PostsView;
  items: PostsListItem[];
  total: number;
  pageCount: number;
  timeZone: string;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('posts'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const rangeFrom = (view.page - 1) * POSTS_PAGE_SIZE + 1;
  const rangeTo = rangeFrom + items.length - 1;
  let lastPage = 0;
  const pageItems = postsPageWindow(view.page, pageCount).map((token) => {
    if (token === 'gap') return { key: `gap-after-${lastPage}`, token };
    lastPage = token;
    return { key: `page-${token}`, token };
  });
  return (
    <>
      <ul className="posts-list" aria-label={t('list.label')}>
        {items.map((post) => {
          const original = safeHref(post.permalink);
          return (
            <li key={post.id} className="posts-item">
              <div className="posts-meta">
                <span className="posts-badge posts-badge-platform" data-platform={post.platform}>
                  {t(`platforms.${post.platform as 'facebook' | 'instagram' | 'tiktok'}`)}:{' '}
                  {post.channelName}
                </span>
                <span className="posts-badge" data-kind={post.isAd ? 'ads' : 'organic'}>
                  {t(post.isAd ? 'kind.ads' : 'kind.organic')}
                </span>
                <span className="posts-time">
                  {post.createdTime
                    ? formatAbsoluteTime(post.createdTime, locale, timeZone)
                    : t('list.unknownTime')}
                </span>
              </div>
              <p className="posts-message">
                {post.message ?? t('list.noMessage', { id: post.externalId })}
              </p>
              <div className="posts-stats">
                <span>{t('list.comments', { count: post.commentCount })}</span>
                <span className={post.pendingCount > 0 ? 'posts-pending' : undefined}>
                  {post.pendingCount > 0
                    ? t('list.pending', { count: post.pendingCount })
                    : t('list.noPending')}
                </span>
                <span className="posts-id">{t('list.postId', { id: post.externalId })}</span>
                {original ? (
                  <a href={original} target="_blank" rel="noopener noreferrer">
                    {t('list.viewOriginal')}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="posts-footer">
        <span className="posts-range">{t('range', { from: rangeFrom, to: rangeTo, total })}</span>
        <nav className="posts-pagination" aria-label={t('pagination.label')}>
          {view.page > 1 ? (
            <Link
              href={buildPostsHref(view, { page: view.page - 1 })}
              rel="prev"
              className="posts-page"
              aria-label={t('pagination.prev')}
            >
              ‹
            </Link>
          ) : null}
          {pageItems.map(({ key, token }) =>
            token === 'gap' ? (
              <span key={key} className="posts-page-gap" aria-hidden="true">
                …
              </span>
            ) : (
              <Link
                key={token}
                href={buildPostsHref(view, { page: token })}
                className="posts-page"
                aria-label={t('pageNumber', { page: token })}
                aria-current={token === view.page ? 'page' : undefined}
              >
                {token}
              </Link>
            ),
          )}
          {view.page < pageCount ? (
            <Link
              href={buildPostsHref(view, { page: view.page + 1 })}
              rel="next"
              className="posts-page"
              aria-label={t('pagination.next')}
            >
              ›
            </Link>
          ) : null}
        </nav>
      </div>
    </>
  );
}

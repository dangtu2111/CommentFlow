import { isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { buildPostsHref, POSTS_PAGE_SIZE, type PostsView } from '../../lib/posts-filters';
import { postsPageWindow } from '../../lib/posts-pagination';
import { Icon, type IconName } from '../ui/icon';
import { Pill, type PillProps } from '../ui/pill';
import { PostCard } from './post-card';

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
  /** Chỉ route dev [MẪU]: tiêu đề, huy hiệu gắn sản phẩm, dòng gợi ý AI — bài thật chưa có các dữ liệu này. */
  title?: string;
  /** Chữ thời gian tương đối của mẫu ("15 phút trước"); bài thật dùng `createdTime`. */
  timeLabel?: string;
  badge?: ReactNode;
  footer?: ReactNode;
};

const PLATFORM_LOOK: Record<string, { tone: PillProps['tone']; icon: IconName }> = {
  facebook: { tone: 'primary', icon: 'public' },
  instagram: { tone: 'outlineSecondary', icon: 'photo_camera' },
  tiktok: { tone: 'surface', icon: 'videocam' },
};

const pageBase = 'rounded px-2.5 py-1 font-label-sm text-label-sm';
const pageArrow = 'rounded p-1.5 text-on-surface-variant hover:bg-surface-container';

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
 * Bài chưa đồng bộ nội dung (`message` trống, chờ POST-HYDRATE) hiện mã bài thay cho tiêu đề. Chỉ dùng trong `.tw`.
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
    <div className="space-y-space-md">
      <div className="flex items-center justify-between px-space-xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
        <span>{t('list.heading')}</span>
        <span>{t('list.sortSummary', { sort: t(`sort.${view.sort}`) })}</span>
      </div>
      <ul className="space-y-space-md" aria-label={t('list.label')}>
        {items.map((post) => {
          const original = safeHref(post.permalink);
          const look = PLATFORM_LOOK[post.platform] ?? PLATFORM_LOOK.facebook;
          return (
            <PostCard
              key={post.id}
              pending={post.pendingCount > 0}
              meta={
                <>
                  <Pill tone={look?.tone}>
                    {look ? <Icon name={look.icon} size={12} /> : null}
                    {`${t(`platformShort.${post.platform as 'facebook' | 'instagram' | 'tiktok'}`)}: ${post.channelName}`}
                  </Pill>
                  <Pill tone={post.isAd ? 'danger' : 'muted'}>
                    {post.isAd ? <Icon name="campaign" size={12} /> : null}
                    {t(post.isAd ? 'kind.ads' : 'kind.organic')}
                  </Pill>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {post.timeLabel ??
                      (post.createdTime
                        ? formatAbsoluteTime(post.createdTime, locale, timeZone)
                        : t('list.unknownTime'))}
                  </span>
                </>
              }
              {...(post.badge ? { badge: post.badge } : {})}
              {...(post.title ? { title: post.title } : {})}
              snippet={post.message ?? t('list.noMessage', { id: post.externalId })}
              stats={
                <>
                  <span className="font-label-md text-label-md text-on-surface-variant">
                    {t('list.comments', { count: post.commentCount })}
                  </span>
                  {post.pendingCount > 0 ? (
                    <span className="flex items-center gap-1 font-label-md text-label-md font-semibold text-error">
                      <Icon name="mark_chat_unread" size={14} />
                      {t('list.pending', { count: post.pendingCount })}
                    </span>
                  ) : (
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {t('list.noPending')}
                    </span>
                  )}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {t('list.postId', { id: post.externalId })}
                  </span>
                  {original ? (
                    <a
                      href={original}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-label-sm text-label-sm text-primary hover:underline"
                    >
                      {t('list.viewOriginal')}
                    </a>
                  ) : null}
                </>
              }
              {...(post.footer ? { footer: post.footer } : {})}
            />
          );
        })}
      </ul>
      <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-space-sm">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {t('range', { from: rangeFrom, to: rangeTo, total })}
        </span>
        <nav aria-label={t('pagination.label')} className="flex items-center gap-1">
          {view.page > 1 ? (
            <Link
              href={buildPostsHref(view, { page: view.page - 1 })}
              rel="prev"
              className={pageArrow}
              aria-label={t('pagination.prev')}
            >
              <Icon name="chevron_left" size={16} />
            </Link>
          ) : null}
          {pageItems.map(({ key, token }) =>
            token === 'gap' ? (
              <span key={key} className="px-1 text-on-surface-variant" aria-hidden="true">
                …
              </span>
            ) : (
              <Link
                key={token}
                href={buildPostsHref(view, { page: token })}
                className={
                  token === view.page
                    ? `${pageBase} bg-primary-container text-on-primary`
                    : `${pageBase} text-on-surface hover:bg-surface-container`
                }
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
              className={pageArrow}
              aria-label={t('pagination.next')}
            >
              <Icon name="chevron_right" size={16} />
            </Link>
          ) : null}
        </nav>
      </div>
    </div>
  );
}

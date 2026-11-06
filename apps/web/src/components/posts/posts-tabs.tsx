import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildPostsHref,
  POSTS_PLATFORM_KEYS,
  type PostsPlatformKey,
  type PostsView,
} from '../../lib/posts-filters';

/**
 * Tab nền tảng (design/stitch/posts.png): liên kết thường (không cần JavaScript), đổi nền tảng thì về trang 1 và bỏ
 * lọc kênh (kênh thuộc một nền tảng). `counts` (tùy chọn) là số bài theo tab — trang thật chưa truyền vì cần truy vấn
 * đếm (gap POSTS-LIST-LINK-FILTER); chỉ trang dev [MẪU] truyền.
 */
export async function PostsTabs({
  view,
  counts,
}: {
  view: PostsView;
  counts?: Partial<Record<PostsPlatformKey | 'all', number>>;
}) {
  const t = await getTranslations('posts');
  const tabs: Array<{
    key: PostsPlatformKey | 'all';
    platform: PostsPlatformKey | undefined;
    label: string;
  }> = [
    { key: 'all', platform: undefined, label: t('tabs.all') },
    ...POSTS_PLATFORM_KEYS.map((platform) => ({
      key: platform,
      platform,
      label: t(`platforms.${platform}`),
    })),
  ];
  const { platform: _platform, channelId: _channelId, ...kept } = view;
  return (
    <nav className="posts-tabs" aria-label={t('tabs.label')}>
      {tabs.map((tab) => {
        const active = (view.platform ?? undefined) === tab.platform;
        const count = counts?.[tab.key];
        return (
          <Link
            key={tab.key}
            href={buildPostsHref({
              ...kept,
              ...(tab.platform ? { platform: tab.platform } : {}),
              page: 1,
            })}
            className="posts-tab"
            data-platform={tab.platform}
            aria-current={active ? 'page' : undefined}
          >
            <span className="posts-tab-dot" aria-hidden="true" />
            {tab.label}
            {count === undefined ? null : <span className="posts-tab-count">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

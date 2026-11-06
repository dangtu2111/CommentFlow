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
 * lọc kênh (kênh thuộc một nền tảng). Chưa hiện số đếm theo nền tảng — cần truy vấn đếm (gap POSTS-LIST-LINK-FILTER).
 */
export async function PostsTabs({ view }: { view: PostsView }) {
  const t = await getTranslations('posts');
  const tabs: Array<{ key: string; platform: PostsPlatformKey | undefined; label: string }> = [
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
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

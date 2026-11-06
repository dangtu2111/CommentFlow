import { getTranslations } from 'next-intl/server';
import {
  buildPostsHref,
  POSTS_PLATFORM_KEYS,
  type PostsPlatformKey,
  type PostsView,
} from '../../lib/posts-filters';
import { Tabs } from '../ui/tabs';

/**
 * Tab nền tảng (design/stitch/posts.png): liên kết thường (không cần JavaScript), đổi nền tảng thì về trang 1 và bỏ
 * lọc kênh (kênh thuộc một nền tảng). Chưa hiện số đếm theo nền tảng — cần truy vấn đếm (gap POSTS-LIST-LINK-FILTER).
 */
export async function PostsTabs({ view }: { view: PostsView }) {
  const t = await getTranslations('posts');
  const platforms: Array<PostsPlatformKey | undefined> = [undefined, ...POSTS_PLATFORM_KEYS];
  const { platform: _platform, channelId: _channelId, ...kept } = view;
  const items = platforms.map((platform) => ({
    key: platform ?? 'all',
    label: platform ? t(`platforms.${platform}`) : t('tabs.all'),
    current: (view.platform ?? undefined) === platform,
    href: buildPostsHref({ ...kept, ...(platform ? { platform } : {}), page: 1 }),
  }));
  return <Tabs variant="pill" label={t('tabs.label')} items={items} />;
}

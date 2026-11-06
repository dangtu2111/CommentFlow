import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildPostsHref,
  POSTS_PLATFORM_KEYS,
  type PostsPlatformKey,
  type PostsView,
} from '../../lib/posts-filters';
import { Icon } from '../ui/icon';

const DOT: Record<PostsPlatformKey, string> = {
  facebook: 'bg-primary-container',
  instagram: 'bg-secondary',
  tiktok: 'bg-outline',
};

const ALL_KEY = 'all' as const;
/** Mốc đo `pnpm ui:fidelity`: tab đang chọn là "nút chính" của màn (nền màu chính, như Stitch). */
const PRIMARY_LANDMARK = 'primary-button';
const pill = 'flex items-center gap-1.5 rounded-full px-3 py-1.5 font-title-sm text-title-sm';

/**
 * Tab nền tảng (design/stitch/posts.html): liên kết thường (không cần JavaScript), đổi nền tảng thì về trang 1 và bỏ
 * lọc kênh (kênh thuộc một nền tảng). Số đếm theo nền tảng chỉ hiện khi truyền `counts` (route dev [MẪU]; số thật
 * cần truy vấn đếm — gap POSTS-LIST-LINK-FILTER). Chỉ dùng bên trong `.tw`.
 */
export async function PostsTabs({
  view,
  counts,
}: {
  view: PostsView;
  counts?: Partial<Record<PostsPlatformKey | 'all', number>>;
}) {
  const t = await getTranslations('posts');
  const platforms: Array<PostsPlatformKey | undefined> = [undefined, ...POSTS_PLATFORM_KEYS];
  const { platform: _platform, channelId: _channelId, ...kept } = view;
  return (
    <nav aria-label={t('tabs.label')} className="flex flex-wrap items-center gap-1.5">
      {platforms.map((platform) => {
        const current = (view.platform ?? undefined) === platform;
        const key = platform ?? ALL_KEY;
        const count = counts?.[key];
        return (
          <Link
            key={key}
            href={buildPostsHref({ ...kept, ...(platform ? { platform } : {}), page: 1 })}
            aria-current={current ? 'page' : undefined}
            data-landmark={current ? PRIMARY_LANDMARK : undefined}
            className={
              current
                ? `${pill} bg-primary-container text-on-primary`
                : `${pill} bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high`
            }
          >
            {platform ? (
              <span className={`h-2 w-2 rounded-full ${DOT[platform]}`} />
            ) : (
              <Icon name="hub" size={14} />
            )}
            <span>{platform ? t(`tabs.platforms.${platform}`) : t('tabs.all')}</span>
            {count === undefined ? null : current ? (
              <span className="rounded-full bg-surface-container-lowest px-1.5 font-label-sm text-label-sm font-semibold text-primary">
                {count}
              </span>
            ) : (
              <span className="font-label-sm text-label-sm text-on-surface-variant">({count})</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

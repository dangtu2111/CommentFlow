import { Search } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildPostsHref,
  POSTS_KIND_KEYS,
  POSTS_PLATFORM_KEYS,
  POSTS_SEARCH_MAX,
  POSTS_SORT_KEYS,
  type PostsView,
} from '../../lib/posts-filters';

type ChannelOption = { id: string; name: string; platform: string };

/** Tìm kiếm + lọc + sắp xếp bằng GET form (không cần JavaScript); gửi form luôn về trang 1. */
export async function PostsToolbar({
  view,
  channels,
}: {
  view: PostsView;
  channels: ChannelOption[];
}) {
  const t = await getTranslations('posts');
  const hasFilter = Boolean(view.platform || view.channelId || view.kind || view.search);
  return (
    <form className="inbox-toolbar" method="get" aria-label={t('toolbar.label')}>
      <label className="inbox-field inbox-field-search">
        <Search size={16} aria-hidden="true" className="posts-search-icon" />
        <span className="visually-hidden">{t('toolbar.searchLabel')}</span>
        <input
          type="search"
          name="q"
          defaultValue={view.search ?? ''}
          maxLength={POSTS_SEARCH_MAX}
          placeholder={t('toolbar.search')}
        />
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.platform')}</span>
        <select name="platform" defaultValue={view.platform ?? ''}>
          <option value="">{t('toolbar.allPlatforms')}</option>
          {POSTS_PLATFORM_KEYS.map((platform) => (
            <option key={platform} value={platform}>
              {t(`platforms.${platform}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.channel')}</span>
        <select name="channel" defaultValue={view.channelId ?? ''}>
          <option value="">{t('toolbar.allChannels')}</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.kind')}</span>
        <select name="kind" defaultValue={view.kind ?? ''}>
          <option value="">{t('toolbar.allKinds')}</option>
          {POSTS_KIND_KEYS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.sort')}</span>
        <select name="sort" defaultValue={view.sort}>
          {POSTS_SORT_KEYS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sort.${sort}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="inbox-toolbar-actions">
        <button type="submit" className="btn btn-primary">
          {t('toolbar.apply')}
        </button>
        {hasFilter ? (
          <Link href={buildPostsHref({ sort: view.sort, page: 1 })} className="inbox-clear">
            {t('toolbar.clear')}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

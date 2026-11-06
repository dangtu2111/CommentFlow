import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  buildPostsHref,
  POSTS_KIND_KEYS,
  POSTS_SEARCH_MAX,
  POSTS_SORT_KEYS,
  type PostsView,
} from '../../lib/posts-filters';
import { Icon } from '../ui/icon';

type ChannelOption = { id: string; name: string; platform: string };

const field =
  'w-full appearance-none rounded-lg bg-surface-container-low px-3 py-2 pr-8 font-title-sm text-title-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary';

function SelectShell({
  icon,
  children,
}: {
  icon: 'expand_more' | 'filter_alt';
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
        <Icon name={icon} size={16} />
      </span>
    </div>
  );
}

/**
 * Tìm kiếm + lọc + sắp xếp bằng GET form (không cần JavaScript); gửi form luôn về trang 1. Nền tảng chọn bằng tab
 * phía trên nên đi kèm ô ẩn. "Trạng thái gắn" và "Bộ lọc nâng cao" chưa có chức năng → vô hiệu "Sắp có".
 */
export async function PostsToolbar({
  view,
  channels,
  linkStateOptions,
}: {
  view: PostsView;
  channels: ChannelOption[];
  /** Chỉ route dev [MẪU]: các lựa chọn "Trạng thái gắn" của Stitch (có số đếm). Bản thật chỉ có "Tất cả". */
  linkStateOptions?: string[];
}) {
  const t = await getTranslations('posts');
  const hasFilter = Boolean(view.platform || view.channelId || view.kind || view.search);
  const soon = t('soon');
  return (
    <form method="get" aria-label={t('toolbar.label')} className="space-y-space-sm">
      {view.platform ? <input type="hidden" name="platform" value={view.platform} /> : null}
      <div className="grid grid-cols-1 items-center gap-space-sm pt-space-xs md:grid-cols-12">
        <label className="relative md:col-span-4">
          <span className="sr-only">{t('toolbar.searchLabel')}</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            name="q"
            defaultValue={view.search ?? ''}
            maxLength={POSTS_SEARCH_MAX}
            placeholder={t('toolbar.search')}
            className="w-full rounded-lg bg-surface-container-low py-2 pl-9 pr-4 font-body-sm text-body-sm text-on-surface shadow-inner placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="md:col-span-2">
          <span className="sr-only">{t('toolbar.channel')}</span>
          <SelectShell icon="expand_more">
            <select name="channel" defaultValue={view.channelId ?? ''} className={field}>
              <option value="">{t('toolbar.allChannels')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </SelectShell>
        </label>
        <div className="md:col-span-2" title={soon}>
          <SelectShell icon="expand_more">
            <select
              disabled
              aria-disabled="true"
              aria-label={t('toolbar.linkState')}
              className={`${field} cursor-not-allowed opacity-60`}
            >
              {(linkStateOptions ?? [t('toolbar.linkState')]).map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </SelectShell>
        </div>
        <label className="md:col-span-2">
          <span className="sr-only">{t('toolbar.kind')}</span>
          <SelectShell icon="filter_alt">
            <select name="kind" defaultValue={view.kind ?? ''} className={field}>
              <option value="">{t('toolbar.allKinds')}</option>
              {POSTS_KIND_KEYS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`toolbar.kindOption.${kind}`)}
                </option>
              ))}
            </select>
          </SelectShell>
        </label>
        <label className="md:col-span-2">
          <span className="sr-only">{t('toolbar.sort')}</span>
          <SelectShell icon="expand_more">
            <select name="sort" defaultValue={view.sort} className={field}>
              {POSTS_SORT_KEYS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`sort.${sort}`)}
                </option>
              ))}
            </select>
          </SelectShell>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-space-sm">
        {hasFilter ? (
          <Link
            href={buildPostsHref({ sort: view.sort, page: 1 })}
            className="font-label-md text-label-md text-primary hover:underline"
          >
            {t('toolbar.clear')}
          </Link>
        ) : null}
        <span
          className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface opacity-60"
          aria-disabled="true"
          title={soon}
        >
          <Icon name="tune" size={16} />
          <span>{t('toolbar.advanced')}</span>
        </span>
        <button
          type="submit"
          className="rounded-lg bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary shadow-sm transition-all hover:opacity-90"
        >
          {t('toolbar.apply')}
        </button>
      </div>
    </form>
  );
}

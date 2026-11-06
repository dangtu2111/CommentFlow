import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buildInboxHref, INBOX_SEARCH_MAX, type InboxView } from '../../lib/inbox-filters';
import { Icon } from '../ui/icon';

type ChannelOption = { id: string; name: string; platform: string };

/**
 * Đầu cột danh sách: ô tìm + nút lọc nâng cao (kênh) bằng GET form (không cần JavaScript) và dòng sắp xếp (liên kết
 * đổi chiều). Gửi form tạo URL mới, không mang con trỏ phân trang; tab/nền tảng/quảng cáo giữ qua trường ẩn.
 * Class Tailwind chép từ `design/stitch/comments.html`.
 */
export async function InboxToolbar({
  view,
  channels,
  sample,
}: {
  view: InboxView;
  channels: ChannelOption[];
  /** Ghi chú ưu tiên + dải "N bình luận mới": chưa có cơ chế thật (đẩy realtime, sắp theo ưu tiên) → chỉ trang mẫu. */
  sample?: { priorityNote: string; newCount: number };
}) {
  const t = await getTranslations('comments');
  const hasFilter = Boolean(view.platform || view.channelId || view.adsOnly || view.search);
  const nextSort = view.sort === 'oldest' ? 'newest' : 'oldest';
  return (
    <div className="shrink-0 space-y-2 bg-surface-container-lowest p-3">
      <form method="get" aria-label={t('toolbar.label')}>
        <input type="hidden" name="tab" value={view.tab} />
        <input type="hidden" name="sort" value={view.sort} />
        {view.platform ? <input type="hidden" name="platform" value={view.platform} /> : null}
        {view.adsOnly ? <input type="hidden" name="ads" value="1" /> : null}
        <div className="relative flex items-center gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">{t('toolbar.searchLabel')}</span>
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              name="q"
              className="h-8 w-full rounded bg-surface-container-low pl-8 pr-3 font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container"
              defaultValue={view.search ?? ''}
              maxLength={INBOX_SEARCH_MAX}
              placeholder={t('toolbar.search')}
            />
          </label>
          <details className="group/adv" open={Boolean(view.channelId)}>
            <summary
              className="flex h-8 cursor-pointer list-none items-center rounded bg-surface-container px-2 text-on-surface-variant transition-colors hover:bg-surface-container-high [&::-webkit-details-marker]:hidden"
              title={t('toolbar.advanced')}
              aria-label={t('toolbar.advanced')}
            >
              <Icon name="filter_list" size={16} />
            </summary>
            <div className="absolute inset-x-0 top-9 z-10 flex items-end gap-2 rounded-lg bg-surface-container-lowest p-3 shadow-md">
              <label className="flex flex-1 flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
                <span>{t('toolbar.channel')}</span>
                <select
                  name="channel"
                  className="h-8 rounded bg-surface-container-low px-2 font-body-sm text-body-sm text-on-surface"
                  defaultValue={view.channelId ?? ''}
                >
                  <option value="">{t('toolbar.allChannels')}</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="h-8 rounded bg-primary-container px-3 font-label-md text-label-md text-on-primary hover:bg-primary"
              >
                {t('toolbar.apply')}
              </button>
            </div>
          </details>
        </div>
      </form>
      <div className="flex items-center justify-between gap-2 px-1 font-label-sm text-label-sm text-on-surface-variant">
        <div className="flex items-center gap-3">
          <Link
            href={buildInboxHref(view, { sort: nextSort, cursor: null })}
            className="flex items-center gap-1"
            title={t(`sort.${nextSort}`)}
          >
            <span>{`${t('toolbar.sort')}:`}</span>
            <strong className="font-semibold text-on-surface">{t(`sort.${view.sort}`)}</strong>
            <span className={view.sort === 'oldest' ? '' : 'rotate-180'}>
              <Icon name="arrow_downward" size={12} />
            </span>
          </Link>
          {hasFilter ? (
            <Link
              href={buildInboxHref({ tab: view.tab, sort: view.sort })}
              className="text-primary hover:underline"
            >
              {t('toolbar.clear')}
            </Link>
          ) : null}
        </div>
        {sample ? (
          <span className="font-medium text-tertiary-container">{sample.priorityNote}</span>
        ) : null}
      </div>
      {sample ? (
        <button
          type="button"
          className="group flex w-full items-center justify-between rounded bg-secondary-fixed px-3 py-1.5 text-on-secondary-fixed transition-colors hover:bg-secondary-fixed-dim aria-[disabled=true]:opacity-60"
          aria-disabled="true"
          title={t('soon')}
        >
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-ping rounded-full bg-secondary" aria-hidden="true" />
            <strong className="font-title-sm text-title-sm">
              {t('list.newBanner', { count: sample.newCount })}
            </strong>
          </span>
          <span className="flex items-center gap-0.5 font-label-sm text-label-sm group-hover:underline">
            {t('list.loadNew')} <Icon name="refresh" size={12} />
          </span>
        </button>
      ) : null}
    </div>
  );
}

import { ArrowDown, ArrowUp, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buildInboxHref, INBOX_SEARCH_MAX, type InboxView } from '../../lib/inbox-filters';

type ChannelOption = { id: string; name: string; platform: string };

/**
 * Đầu cột danh sách: ô tìm + nút lọc nâng cao (kênh) bằng GET form (không cần JavaScript) và dòng sắp xếp (liên kết
 * đổi chiều). Gửi form tạo URL mới, không mang con trỏ phân trang; tab/nền tảng/quảng cáo giữ qua trường ẩn.
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
  const SortIcon = view.sort === 'oldest' ? ArrowDown : ArrowUp;
  return (
    <div className="inbox-head">
      <form method="get" aria-label={t('toolbar.label')}>
        <input type="hidden" name="tab" value={view.tab} />
        <input type="hidden" name="sort" value={view.sort} />
        {view.platform ? <input type="hidden" name="platform" value={view.platform} /> : null}
        {view.adsOnly ? <input type="hidden" name="ads" value="1" /> : null}
        <div className="inbox-search-row">
          <label className="inbox-searchbox">
            <span className="visually-hidden">{t('toolbar.searchLabel')}</span>
            <Search className="inbox-searchbox-icon" size={16} aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={view.search ?? ''}
              maxLength={INBOX_SEARCH_MAX}
              placeholder={t('toolbar.search')}
            />
          </label>
          <details className="inbox-advanced" open={Boolean(view.channelId)}>
            <summary title={t('toolbar.advanced')} aria-label={t('toolbar.advanced')}>
              <SlidersHorizontal size={16} aria-hidden="true" />
            </summary>
            <div className="inbox-advanced-panel">
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
              <button type="submit" className="btn btn-primary">
                {t('toolbar.apply')}
              </button>
            </div>
          </details>
        </div>
      </form>
      <div className="inbox-sortline">
        <Link
          href={buildInboxHref(view, { sort: nextSort, cursor: null })}
          title={t(`sort.${nextSort}`)}
        >
          <span>{`${t('toolbar.sort')}:`}</span>
          <strong>{t(`sort.${view.sort}`)}</strong>
          <SortIcon size={12} aria-hidden="true" />
        </Link>
        {hasFilter ? (
          <Link href={buildInboxHref({ tab: view.tab, sort: view.sort })} className="inbox-clear">
            {t('toolbar.clear')}
          </Link>
        ) : null}
        {sample ? <span className="inbox-priority">{sample.priorityNote}</span> : null}
      </div>
      {sample ? (
        <button type="button" className="inbox-newbar" aria-disabled="true" title={t('soon')}>
          <span className="inbox-newbar-ping" aria-hidden="true" />
          <strong>{t('list.newBanner', { count: sample.newCount })}</strong>
          <span className="inbox-newbar-load">
            {t('list.loadNew')} <RefreshCw size={12} aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

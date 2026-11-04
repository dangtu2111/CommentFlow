import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildInboxHref,
  INBOX_PLATFORM_KEYS,
  INBOX_SEARCH_MAX,
  type InboxView,
} from '../../lib/inbox-filters';

type ChannelOption = { id: string; name: string; platform: string };

/**
 * Tìm kiếm + lọc + sắp xếp bằng GET form (không cần JavaScript): gửi form tạo URL mới, không mang con trỏ phân trang.
 * Tab hiện tại giữ qua trường ẩn.
 */
export async function InboxToolbar({
  view,
  channels,
}: {
  view: InboxView;
  channels: ChannelOption[];
}) {
  const t = await getTranslations('comments');
  const hasFilter = Boolean(view.platform || view.channelId || view.adsOnly || view.search);
  return (
    <form className="inbox-toolbar" method="get" aria-label={t('toolbar.label')}>
      <input type="hidden" name="tab" value={view.tab} />
      <label className="inbox-field inbox-field-search">
        <span className="visually-hidden">{t('toolbar.searchLabel')}</span>
        <input
          type="search"
          name="q"
          defaultValue={view.search ?? ''}
          maxLength={INBOX_SEARCH_MAX}
          placeholder={t('toolbar.search')}
        />
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.platform')}</span>
        <select name="platform" defaultValue={view.platform ?? ''}>
          <option value="">{t('toolbar.allPlatforms')}</option>
          {INBOX_PLATFORM_KEYS.map((platform) => (
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
        <span>{t('toolbar.sort')}</span>
        <select name="sort" defaultValue={view.sort}>
          <option value="oldest">{t('sort.oldest')}</option>
          <option value="newest">{t('sort.newest')}</option>
        </select>
      </label>
      <label className="inbox-check">
        <input type="checkbox" name="ads" value="1" defaultChecked={view.adsOnly ?? false} />
        <span>{t('toolbar.adsOnly')}</span>
      </label>
      <div className="inbox-toolbar-actions">
        <button type="submit" className="btn btn-primary">
          {t('toolbar.apply')}
        </button>
        {hasFilter ? (
          <Link href={buildInboxHref({ tab: view.tab, sort: view.sort })} className="inbox-clear">
            {t('toolbar.clear')}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

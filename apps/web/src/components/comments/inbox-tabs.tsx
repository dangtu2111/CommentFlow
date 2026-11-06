import { COMMENT_LABELS } from '@flow/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildInboxHref,
  INBOX_PLATFORM_KEYS,
  INBOX_TAB_KEYS,
  type InboxTabKey,
  type InboxView,
} from '../../lib/inbox-filters';
import { inboxTabGroup, labelTone } from '../../lib/inbox-visual';
import { Tabs } from '../ui/tabs';

/**
 * Cột trái (224px): tab trạng thái kèm số lượng thật, chia hai cụm (đang xử lý · đã xong), lọc nền tảng, chú giải
 * nhãn AI và công tắc "Chỉ bài quảng cáo". Chọn tab/bộ lọc giữ nguyên các bộ lọc khác, bỏ con trỏ phân trang. Chấm
 * màu là trang trí (`aria-hidden`), nghĩa nằm ở chữ. Nhãn AI là chú giải (chưa lọc được — gap INBOX-FILTER-LABEL).
 */
export async function InboxTabs({
  view,
  counts,
}: {
  view: InboxView;
  counts: Record<InboxTabKey, number>;
}) {
  const t = await getTranslations('comments');
  const renderTab = (tab: InboxTabKey) => (
    <li key={tab}>
      <Link
        href={buildInboxHref(view, { tab, cursor: null, selected: undefined })}
        className="inbox-tab"
        aria-current={view.tab === tab ? 'page' : undefined}
      >
        <span className="inbox-tab-dot" data-tab={tab} aria-hidden="true" />
        <span className="inbox-tab-name">{t(`tabs.${tab}`)}</span>
        <span className="inbox-tab-count">{counts[tab]}</span>
      </Link>
    </li>
  );
  const platformItems = [
    { key: 'all', platform: undefined, label: t('toolbar.platformAll') },
    ...INBOX_PLATFORM_KEYS.map((platform) => ({
      key: platform,
      platform,
      label: t(`platforms.${platform}`),
    })),
  ].map(({ key, platform, label }) => ({
    key,
    label,
    href: buildInboxHref(view, { platform, cursor: null, selected: undefined }),
    current: view.platform === platform,
  }));
  return (
    <nav className="inbox-tabs" aria-label={t('tabsLabel')}>
      <p className="inbox-section-title">{t('tabsLabel')}</p>
      <ul>{INBOX_TAB_KEYS.filter((k) => inboxTabGroup(k) === 'active').map(renderTab)}</ul>
      <ul className="inbox-tabs-done">
        {INBOX_TAB_KEYS.filter((k) => inboxTabGroup(k) === 'done').map(renderTab)}
      </ul>
      <div className="inbox-filter-block">
        <p className="inbox-section-title">{t('toolbar.platform')}</p>
        <div className="inbox-platform">
          <Tabs items={platformItems} label={t('toolbar.platform')} variant="pill" />
        </div>
      </div>
      <div className="inbox-filter-block">
        <p className="inbox-section-title">{t('toolbar.labelsTitle')}</p>
        <ul className="inbox-legend">
          {COMMENT_LABELS.map((label) => (
            <li key={label} className={`chip chip-label chip-tone-${labelTone(label)}`}>
              {t(`labels.${label}`)}
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={buildInboxHref(view, {
          adsOnly: view.adsOnly ? undefined : true,
          cursor: null,
          selected: undefined,
        })}
        className="inbox-switch"
        role="switch"
        aria-checked={view.adsOnly === true}
      >
        <span>{t('toolbar.adsOnly')}</span>
        <span className="inbox-switch-track" aria-hidden="true" />
      </Link>
    </nav>
  );
}

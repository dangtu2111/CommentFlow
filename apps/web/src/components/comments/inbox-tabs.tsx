import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildInboxHref,
  INBOX_TAB_KEYS,
  type InboxTabKey,
  type InboxView,
} from '../../lib/inbox-filters';
import { inboxTabGroup } from '../../lib/inbox-visual';

/**
 * Cột trái: tab trạng thái kèm số lượng thật, chia hai cụm (đang xử lý · đã xong); chọn tab giữ nguyên bộ lọc, bỏ
 * con trỏ phân trang. Chấm màu là trang trí (`aria-hidden`), nghĩa nằm ở chữ.
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
  return (
    <nav className="inbox-tabs" aria-label={t('tabsLabel')}>
      <h1 className="inbox-title">{t('title')}</h1>
      <p className="inbox-tabs-heading">{t('tabsLabel')}</p>
      <ul>{INBOX_TAB_KEYS.filter((k) => inboxTabGroup(k) === 'active').map(renderTab)}</ul>
      <ul className="inbox-tabs-done">
        {INBOX_TAB_KEYS.filter((k) => inboxTabGroup(k) === 'done').map(renderTab)}
      </ul>
    </nav>
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  buildInboxHref,
  INBOX_TAB_KEYS,
  type InboxTabKey,
  type InboxView,
} from '../../lib/inbox-filters';

/** Cột trái: tab trạng thái kèm số lượng thật; chọn tab giữ nguyên bộ lọc, bỏ con trỏ phân trang. */
export async function InboxTabs({
  view,
  counts,
}: {
  view: InboxView;
  counts: Record<InboxTabKey, number>;
}) {
  const t = await getTranslations('comments');
  return (
    <nav className="inbox-tabs" aria-label={t('tabsLabel')}>
      <h1 className="inbox-title">{t('title')}</h1>
      <ul>
        {INBOX_TAB_KEYS.map((tab) => (
          <li key={tab}>
            <Link
              href={buildInboxHref(view, { tab, cursor: null, selected: undefined })}
              className="inbox-tab"
              aria-current={view.tab === tab ? 'page' : undefined}
            >
              <span>{t(`tabs.${tab}`)}</span>
              <span className="inbox-tab-count">{counts[tab]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

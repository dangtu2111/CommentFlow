import { isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildInboxHref, type InboxCursorValue, type InboxView } from '../../lib/inbox-filters';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/inbox-format';

export type InboxListItem = {
  id: string;
  status: string;
  text: string;
  authorName: string | null;
  createdTime: Date | null;
  label: string | null;
  needsFollowup: boolean;
  channelName: string;
  platform: string;
  isAd: boolean;
};

/**
 * Cột giữa: danh sách bình luận. Chỉ hiển thị dữ liệu thật; nội dung là văn bản thuần (React tự thoát HTML), cắt 3 dòng
 * bằng CSS. Thời gian tương đối theo ngôn ngữ giao diện, `title` là thời điểm đầy đủ theo múi giờ workspace.
 */
export async function InboxList({
  view,
  items,
  total,
  nextCursor,
  timeZone,
  now,
}: {
  view: InboxView;
  items: InboxListItem[];
  total: number;
  nextCursor: InboxCursorValue | null;
  timeZone: string;
  now: Date;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('comments'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const knownStatus = (status: string) =>
    [
      'new',
      'processing',
      'pending_review',
      'needs_human',
      'scheduled_auto',
      'sending',
      'replied',
      'auto_replied',
      'send_failed',
      'skipped',
      'spam_suspected',
      'hidden',
    ].includes(status);
  return (
    <>
      <ul className="inbox-items" aria-label={t('list.label')}>
        {items.map((item) => (
          <li key={item.id} className="inbox-item">
            <div className="inbox-item-head">
              <span className="inbox-author">{item.authorName ?? t('list.anonymous')}</span>
              <time
                className="inbox-time"
                dateTime={item.createdTime?.toISOString()}
                title={formatAbsoluteTime(item.createdTime, locale, timeZone)}
              >
                {formatRelativeTime(item.createdTime, now, locale)}
              </time>
            </div>
            <div className="inbox-source">
              {item.platform === 'facebook' ||
              item.platform === 'instagram' ||
              item.platform === 'tiktok'
                ? t(`platforms.${item.platform}`)
                : item.platform}
              {' · '}
              {item.channelName}
            </div>
            <p className="inbox-text">{item.text}</p>
            <div className="inbox-chips">
              <span className={`chip chip-status chip-${item.status}`}>
                {knownStatus(item.status) ? t(`status.${item.status as 'new'}`) : item.status}
              </span>
              {item.needsFollowup ? <span className="chip">{t('list.followup')}</span> : null}
              {item.isAd ? <span className="chip">{t('list.ad')}</span> : null}
              {item.label ? <span className="chip">{item.label}</span> : null}
            </div>
          </li>
        ))}
      </ul>
      <footer className="inbox-footer">
        <span>{t('list.shown', { shown: items.length, total })}</span>
        <span className="inbox-pager">
          {view.cursor ? (
            <Link href={buildInboxHref(view, { cursor: null })}>{t('list.first')}</Link>
          ) : null}
          {nextCursor ? (
            <Link href={buildInboxHref(view, { cursor: nextCursor })}>{t('list.next')}</Link>
          ) : null}
        </span>
      </footer>
    </>
  );
}

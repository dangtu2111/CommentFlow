import { COMMENT_LABELS, isCommentLabel, isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BULK_MAX } from '../../lib/bulk-input';
import { buildInboxHref, type InboxCursorValue, type InboxView } from '../../lib/inbox-filters';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/inbox-format';
import { labelTone, platformBadgeText } from '../../lib/inbox-visual';
import { userInitials } from '../../lib/user-initials';
import { Avatar } from '../ui/avatar';
import { BulkCheckbox, type BulkLabels, BulkProvider } from './bulk-selection';

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
  lockedByName: string | null;
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
  const bulkLabels: BulkLabels = {
    select: t.raw('bulk.select'),
    toolbar: t.raw('bulk.toolbar'),
    selected: t.raw('bulk.selected'),
    clear: t('bulk.clear'),
    skip: t('bulk.skip'),
    hide: t('bulk.hide'),
    relabel: t('bulk.relabel'),
    labelPick: t('bulk.labelPick'),
    apply: t('bulk.apply'),
    working: t('bulk.working'),
    shortcuts: t('bulk.shortcuts'),
    confirmTitle: t.raw('bulk.confirmTitle'),
    confirmBody: t('bulk.confirmBody'),
    confirmYes: t.raw('bulk.confirmYes'),
    confirmNo: t('bulk.confirmNo'),
    result: t.raw('bulk.result'),
    reasons: t.raw('bulk.reasons'),
    rejections: t.raw('bulk.rejections'),
  };
  const labelOptions = COMMENT_LABELS.map((value) => ({ value, text: t(`labels.${value}`) }));
  const labelText = (label: string) => (isCommentLabel(label) ? t(`labels.${label}`) : label);
  return (
    <BulkProvider
      ids={items.map((i) => i.id)}
      max={BULK_MAX}
      labelOptions={labelOptions}
      labels={bulkLabels}
    >
      <ul className="inbox-items" aria-label={t('list.label')}>
        {items.map((item) => (
          <li key={item.id} className="inbox-item" data-comment-id={item.id}>
            <BulkCheckbox id={item.id} name={item.authorName ?? t('list.anonymous')} />
            <Link
              href={buildInboxHref(view, { selected: item.id })}
              className="inbox-item-link"
              aria-current={view.selected === item.id ? 'true' : undefined}
            >
              <Avatar size="sm" badge={platformBadgeText(item.platform)}>
                {userInitials(item.authorName ?? t('list.anonymous'))}
              </Avatar>
              <div className="inbox-item-body">
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
                  {item.label ? (
                    <span className={`chip chip-label chip-tone-${labelTone(item.label)}`}>
                      {labelText(item.label)}
                    </span>
                  ) : null}
                  {item.needsFollowup ? <span className="chip">{t('list.followup')}</span> : null}
                  {item.isAd ? <span className="chip">{t('list.ad')}</span> : null}
                  {item.lockedByName ? (
                    <span className="chip chip-lock">
                      {t('list.lockedBy', { name: item.lockedByName })}
                    </span>
                  ) : null}
                  <span className={`chip chip-status chip-${item.status} inbox-chip-end`}>
                    {knownStatus(item.status) ? t(`status.${item.status as 'new'}`) : item.status}
                  </span>
                </div>
              </div>
            </Link>
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
    </BulkProvider>
  );
}

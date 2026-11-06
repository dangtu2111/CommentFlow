import { COMMENT_LABELS, isCommentLabel, isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BULK_MAX } from '../../lib/bulk-input';
import { buildInboxHref, type InboxCursorValue, type InboxView } from '../../lib/inbox-filters';
import { formatAbsoluteTime, formatRelativeTime, toIsoString } from '../../lib/inbox-format';
import { platformBadgeText } from '../../lib/inbox-visual';
import { userInitials } from '../../lib/user-initials';
import { Avatar } from '../ui/avatar';
import { Icon } from '../ui/icon';
import { BulkCheckbox, type BulkLabels, BulkProvider } from './bulk-selection';
import { LabelChip, StatusChip } from './label-chip';

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
  /** Chỉ dữ liệu mẫu (chưa có nguồn thật): đã có gợi ý AI · lượt trao đổi · ghi chú phụ · hậu tố nhãn. */
  extras?: { hasAiDraft?: boolean; turn?: number; sideNote?: string; labelSuffix?: string };
};

const PLATFORM_SHORT: Record<string, string> = {
  facebook: 'FB',
  instagram: 'IG',
  tiktok: 'TikTok',
};
const platformShort = (platform: string) => PLATFORM_SHORT[platform] ?? platform;

const KNOWN_STATUSES = [
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
];

const SMALL_CHIP =
  'inline-flex items-center rounded px-1.5 py-0.5 font-label-sm text-label-sm font-bold';

/**
 * Cột giữa: danh sách bình luận. Chỉ hiển thị dữ liệu thật; nội dung là văn bản thuần (React tự thoát HTML), cắt 2 dòng
 * bằng `line-clamp-2`. Thời gian tương đối theo ngôn ngữ giao diện, `title` là thời điểm đầy đủ theo múi giờ workspace.
 * Class Tailwind chép từ `design/stitch/comments.html` (thẻ bình luận + chân danh sách).
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
      <ul
        className="min-h-0 flex-1 divide-y divide-surface-container overflow-y-auto bg-surface-container-lowest"
        aria-label={t('list.label')}
      >
        {items.map((item) => (
          <li key={item.id} className="flex items-start" data-comment-id={item.id}>
            <BulkCheckbox id={item.id} name={item.authorName ?? t('list.anonymous')} />
            <Link
              href={buildInboxHref(view, { selected: item.id })}
              className="group/item relative block min-w-0 flex-1 cursor-pointer p-3 transition-colors hover:bg-surface-container aria-[current=true]:bg-primary-fixed/20"
              aria-current={view.selected === item.id ? 'true' : undefined}
            >
              <span
                className="absolute inset-y-0 left-0 hidden w-1 bg-primary-container group-aria-[current=true]/item:block"
                aria-hidden="true"
              />
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar size="sm" badge={platformBadgeText(item.platform)}>
                    {userInitials(item.authorName ?? t('list.anonymous'))}
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-title-sm text-title-sm text-on-surface group-aria-[current=true]/item:font-bold">
                      {item.authorName ?? t('list.anonymous')}
                    </div>
                    <div className="truncate font-label-sm text-label-sm text-on-surface-variant">
                      {`${platformShort(item.platform)}: ${item.channelName}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <time
                    className="font-label-sm text-label-sm text-on-surface-variant group-aria-[current=true]/item:font-semibold group-aria-[current=true]/item:text-primary"
                    dateTime={toIsoString(item.createdTime)}
                    title={formatAbsoluteTime(item.createdTime, locale, timeZone)}
                  >
                    {formatRelativeTime(item.createdTime, now, locale)}
                  </time>
                  {item.extras?.hasAiDraft ? (
                    <span
                      className="mt-1 flex items-center gap-0.5 font-label-sm text-label-sm text-secondary"
                      title={t('list.hasAiTitle')}
                    >
                      <Icon name="auto_awesome" size={12} />
                      {t('list.hasAi')}
                    </span>
                  ) : null}
                  {item.lockedByName ? (
                    <span className="mt-1 flex items-center gap-0.5 rounded bg-tertiary-fixed px-1.5 py-0.5 font-label-sm text-label-sm text-on-tertiary-fixed-variant">
                      <Icon name="lock" size={12} />
                      {t('list.lockedBy', { name: item.lockedByName })}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mb-2 line-clamp-2 font-body-sm text-body-sm text-on-surface">
                {item.text}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="flex flex-wrap items-center gap-1">
                  {item.label ? (
                    <LabelChip label={item.label}>
                      {`${labelText(item.label)}${item.extras?.labelSuffix ?? ''}`}
                    </LabelChip>
                  ) : null}
                  {item.needsFollowup ? (
                    <span className={`${SMALL_CHIP} bg-surface-container text-on-surface-variant`}>
                      {t('list.followup')}
                    </span>
                  ) : null}
                  {item.isAd ? (
                    <span
                      className={`${SMALL_CHIP} bg-tertiary/10 text-tertiary`}
                      title={t('list.ad')}
                    >
                      ADS
                    </span>
                  ) : null}
                  <StatusChip status={item.status}>
                    {KNOWN_STATUSES.includes(item.status)
                      ? t(`status.${item.status as 'new'}`)
                      : item.status}
                  </StatusChip>
                </div>
                <div className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                  {item.extras?.turn ? (
                    <span className="flex items-center gap-1">
                      <Icon name="chat_bubble" size={12} />
                      {t('list.turn', { count: item.extras.turn })}
                    </span>
                  ) : null}
                  {item.extras?.sideNote ? <span>{item.extras.sideNote}</span> : null}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <footer className="flex shrink-0 items-center justify-between bg-surface-container p-2.5 font-label-sm text-label-sm text-on-surface-variant">
        <span>
          {view.tab === 'all'
            ? t('list.shown', { shown: items.length, total })
            : t('list.shownIn', {
                shown: items.length,
                total,
                scope: t(`tabs.${view.tab}`).toLocaleLowerCase(locale),
              })}
        </span>
        <span className="flex items-center gap-3">
          {view.cursor ? (
            <Link
              href={buildInboxHref(view, { cursor: null })}
              className="text-primary hover:underline"
            >
              {t('list.first')}
            </Link>
          ) : null}
          {nextCursor ? (
            <Link
              href={buildInboxHref(view, { cursor: nextCursor })}
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {t('list.next')}
              <Icon name="chevron_right" size={12} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 opacity-60" aria-disabled="true">
              {t('list.next')}
              <Icon name="chevron_right" size={12} />
            </span>
          )}
        </span>
      </footer>
    </BulkProvider>
  );
}

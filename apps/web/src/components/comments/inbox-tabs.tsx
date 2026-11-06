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
import { inboxTabGroup } from '../../lib/inbox-visual';
import { Icon, type IconName } from '../ui/icon';
import { LabelChip } from './label-chip';

type TabLook = {
  /** Biểu tượng (Stitch) hoặc chấm màu; không có → chấm trung tính. */
  icon?: IconName;
  iconClass?: string;
  dot?: string;
  count: string;
};

const COUNT_NEUTRAL = 'bg-surface-container font-medium text-on-surface-variant';

/** Hình thức từng tab theo `design/stitch/comments.html` § Trạng thái xử lý. */
const TAB_LOOK: Record<InboxTabKey, TabLook> = {
  new: { dot: 'bg-outline', count: COUNT_NEUTRAL },
  pending_review: { icon: 'schedule', count: COUNT_NEUTRAL },
  scheduled_auto: { dot: 'bg-secondary', count: COUNT_NEUTRAL },
  auto_replied: { icon: 'auto_mode', iconClass: 'text-primary', count: COUNT_NEUTRAL },
  needs_human: {
    dot: 'bg-tertiary-container',
    count: 'bg-on-tertiary-container/40 font-bold text-tertiary',
  },
  needs_followup: { dot: 'bg-tertiary-container', count: COUNT_NEUTRAL },
  spam_suspected: {
    icon: 'shield',
    iconClass: 'text-error',
    count: 'bg-error-container text-on-error-container',
  },
  send_failed: { icon: 'error', count: COUNT_NEUTRAL },
  replied: { icon: 'done_all', count: COUNT_NEUTRAL },
  hidden: { icon: 'visibility_off', count: COUNT_NEUTRAL },
  skipped: { icon: 'archive', count: COUNT_NEUTRAL },
  all: { icon: 'all_inbox', count: 'bg-surface-container-high text-on-surface' },
};

const SECTION_TITLE =
  'mb-2 px-1 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant';

/**
 * Cột trái (224px): tab trạng thái kèm số lượng thật, chia hai cụm (đang xử lý · đã xong), lọc nền tảng, chú giải
 * nhãn AI và công tắc "Chỉ bài quảng cáo". Chọn tab/bộ lọc giữ nguyên các bộ lọc khác, bỏ con trỏ phân trang. Chấm
 * màu là trang trí (`aria-hidden`), nghĩa nằm ở chữ. Nhãn AI là chú giải (chưa lọc được — gap INBOX-FILTER-LABEL).
 * Class Tailwind chép từ `design/stitch/comments.html`.
 */
export async function InboxTabs({
  view,
  counts,
  aiHealth,
}: {
  view: InboxView;
  counts: Record<InboxTabKey, number>;
  /** Độ chính xác AI + ghi chú rule — chưa có số thật nên chỉ trang xem mẫu truyền (thiếu → "—"/"Sắp có"). */
  aiHealth?: { accuracy: string; note: string };
}) {
  const t = await getTranslations('comments');
  const renderTab = (tab: InboxTabKey) => {
    const look = TAB_LOOK[tab];
    return (
      <li key={tab}>
        <Link
          href={buildInboxHref(view, { tab, cursor: null, selected: undefined })}
          className="group/tab flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface aria-[current=page]:bg-primary-container aria-[current=page]:font-medium aria-[current=page]:text-on-primary aria-[current=page]:shadow-sm"
          aria-current={view.tab === tab ? 'page' : undefined}
          data-tab={tab}
        >
          <span className="flex min-w-0 items-center gap-2">
            {look.icon ? (
              <span
                className={`${look.iconClass ?? ''} group-aria-[current=page]/tab:text-on-primary`}
              >
                <Icon name={look.icon} size={14} />
              </span>
            ) : (
              <span
                className={`h-1.5 w-1.5 rounded-full ${look.dot ?? 'bg-outline'} group-aria-[current=page]/tab:bg-on-primary`}
                aria-hidden="true"
              />
            )}
            <span className="truncate font-body-md text-body-md group-aria-[current=page]/tab:font-title-sm">
              {t(`tabs.${tab}`)}
            </span>
          </span>
          <span
            className={`rounded-full px-1.5 font-label-sm text-label-sm ${look.count} group-aria-[current=page]/tab:bg-on-primary/20 group-aria-[current=page]/tab:font-bold group-aria-[current=page]/tab:text-on-primary`}
          >
            {counts[tab]}
          </span>
        </Link>
      </li>
    );
  };
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
    <>
      <nav className="space-y-4 p-3" aria-label={t('tabsLabel')}>
        <div>
          <p className={`${SECTION_TITLE} flex items-center justify-between`}>
            {t('tabsLabel')}
            <Icon name="tune" size={14} />
          </p>
          <ul className="space-y-0.5">
            {INBOX_TAB_KEYS.filter((k) => inboxTabGroup(k) === 'active').map(renderTab)}
          </ul>
          <div className="pb-1 pt-2" aria-hidden="true">
            <div className="h-px bg-surface-container-high" />
          </div>
          <ul className="space-y-0.5">
            {INBOX_TAB_KEYS.filter((k) => inboxTabGroup(k) === 'done').map(renderTab)}
          </ul>
        </div>
        <div className="space-y-3 pt-2">
          <div className="h-px bg-surface-container-high" aria-hidden="true" />
          <div>
            <p className={SECTION_TITLE}>{t('toolbar.platform')}</p>
            <ul className="grid grid-cols-2 gap-1" aria-label={t('toolbar.platform')}>
              {platformItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="block rounded bg-surface-container-low px-2 py-1 text-center font-label-sm text-label-sm text-on-surface hover:bg-surface-container aria-[current=page]:bg-primary-container aria-[current=page]:text-on-primary"
                    aria-current={item.current ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={SECTION_TITLE}>{t('toolbar.labelsTitle')}</p>
            <ul className="flex flex-wrap gap-1">
              {COMMENT_LABELS.map((label) => (
                <li key={label}>
                  <LabelChip label={label} lead={false}>
                    {t(`labels.${label}`)}
                  </LabelChip>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 pt-1">
            <Link
              href={buildInboxHref(view, {
                adsOnly: view.adsOnly ? undefined : true,
                cursor: null,
                selected: undefined,
              })}
              className="group/switch flex cursor-pointer items-center justify-between px-1"
              role="switch"
              aria-checked={view.adsOnly === true}
            >
              <span className="font-body-sm text-body-sm text-on-surface">
                {t('toolbar.adsOnly')}
              </span>
              <span
                className="relative h-4 w-8 rounded-full bg-surface-container-highest transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-surface-container-lowest after:transition-all after:content-[''] group-aria-checked/switch:bg-primary-container group-aria-checked/switch:after:translate-x-4"
                aria-hidden="true"
              />
            </Link>
            <label
              className="flex items-center gap-2 px-1 aria-[disabled=true]:opacity-60"
              aria-disabled="true"
              title={t('soon')}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded bg-surface-container-lowest accent-primary-container"
                disabled
              />
              <span className="font-body-sm text-body-sm text-on-surface">
                {t('tabsExtra.assignedToMe')}
              </span>
            </label>
          </div>
        </div>
      </nav>
      <aside
        className="m-2 space-y-1.5 rounded-lg bg-surface-container-low p-3"
        aria-label={t('tabsExtra.aiHealth')}
        aria-disabled={aiHealth ? undefined : true}
      >
        <p className="flex items-center justify-between">
          <span className="flex items-center gap-1 font-title-sm text-title-sm text-on-surface">
            <span className="text-secondary">
              <Icon name="psychology" size={14} />
            </span>
            {t('tabsExtra.aiHealth')}
          </span>
          <strong className="font-label-sm text-label-sm font-bold text-secondary">
            {aiHealth?.accuracy ?? '—'}
          </strong>
        </p>
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          {aiHealth?.note ?? t('soon')}
        </p>
      </aside>
    </>
  );
}

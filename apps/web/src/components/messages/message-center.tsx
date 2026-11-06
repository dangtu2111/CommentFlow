import { useTranslations } from 'next-intl';
import { cn } from '../../lib/cn';
import { avatarInitial, platformBadgeText } from '../../lib/inbox-visual';
import { type MessageWindowKind, messageWindowState, splitMinutes } from '../../lib/message-window';
import { Icon, type IconName } from '../ui/icon';

/**
 * Trang Tin nhắn 4 cột dựng bằng Tailwind, chép class từ `design/stitch/messages.html` (chỉ chạy trong khung `.tw`).
 * Chưa có kênh nhắn tin thật nên đây là vỏ giao diện: route `/dev/ui/messages` truyền dữ liệu MẪU có nhãn "[MẪU]";
 * mọi nút/bộ lọc chưa có chức năng hiện đúng thiết kế nhưng vô hiệu (`aria-disabled`, chú thích "Sắp có").
 */

export type Platform = 'facebook' | 'instagram' | 'tiktok';

export type ConversationView = {
  id: string;
  name: string;
  platform: Platform;
  preview: string;
  previewBy: 'customer' | 'page' | 'ai';
  ago: string;
  lastCustomerMessageAt: Date;
  chip: 'needsHuman' | 'aiAuto' | 'pending' | null;
  fromComment: boolean;
  /** Nhãn ý định AI dự đoán (chip), nếu có. */
  intent?: string;
  /** Nhân viên đang xử lý, nếu có. */
  assignee?: string;
  /** Làm nổi dòng xem trước (khách đang chờ người thật). */
  urgentPreview?: boolean;
};

export type CustomerView = {
  name: string;
  platform: Platform;
  stage: string;
  interactions: string;
  firstContact: string;
  channelName: string;
  userId: string;
  area: string;
  product: { name: string; sku: string; price: string; stock: number };
  tags: string[];
  note: string;
  noteUpdatedBy: string;
  pastComments: { post: string; time: string; text: string; note: string; linked: boolean }[];
};

export type ThreadMessage = {
  from: 'customer' | 'page' | 'ai';
  text: string;
  time: string;
  /** Chú thích dưới tin (ví dụ "Đã gửi tự động qua Messenger"). */
  meta?: string;
  /** Độ tin cậy do code tính (chỉ tin AI). */
  confidence?: string;
  source?: string;
  urgent?: boolean;
};

export type ThreadView = {
  dayLabel: string;
  quotedComment: string;
  quotedPost: string;
  messages: ThreadMessage[];
  aiSuggestion: string;
  aiSources: string[];
  pageName: string;
  staffName: string;
};

export type TriageStats = {
  nearDeadline: number;
  onTimeRate: string;
  avgHandle: string;
  automationPct: number;
  autoRepliesToday: number;
};

const TAB_KEYS = [
  'nearDeadline',
  'pending',
  'needsHuman',
  'aiReplying',
  'willAutoSend',
  'sendFailed',
  'done',
  'all',
] as const;
export type MessageTabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<MessageTabKey, IconName> = {
  nearDeadline: 'warning',
  pending: 'rule',
  needsHuman: 'support_agent',
  aiReplying: 'smart_toy',
  willAutoSend: 'schedule_send',
  sendFailed: 'error_outline',
  done: 'task_alt',
  all: 'all_inbox',
};

const TAB_BADGE: Record<MessageTabKey, string> = {
  nearDeadline: 'bg-tertiary text-on-tertiary font-bold',
  pending: 'bg-surface-container-lowest text-primary font-bold',
  needsHuman: 'bg-error-container text-on-error-container font-semibold',
  aiReplying: 'bg-secondary-fixed text-on-secondary-fixed font-semibold',
  willAutoSend: 'bg-surface-container-high text-on-surface font-semibold',
  sendFailed: 'bg-surface-container text-on-surface-variant',
  done: 'bg-surface-container-low text-on-surface',
  all: 'bg-surface-container text-on-surface',
};

const TAB_ICON_TONE: Partial<Record<MessageTabKey, string>> = {
  nearDeadline: 'text-tertiary',
  needsHuman: 'text-error',
  aiReplying: 'text-secondary',
  done: 'text-primary',
};

const PLATFORM_BADGE: Record<Platform, string> = {
  facebook: 'bg-primary-container text-on-primary',
  instagram: 'bg-secondary text-on-secondary',
  tiktok: 'bg-inverse-surface text-inverse-on-surface',
};

const QUICK_PLATFORMS = [
  { key: 'facebook', label: 'FB', active: true },
  { key: 'instagram', label: 'IG', active: false },
  { key: 'tiktok', label: 'TikTok', active: false },
] as const;

export type MessageCenterProps = {
  now: Date;
  activeTab: MessageTabKey;
  tabCounts: Record<MessageTabKey, number>;
  stats: TriageStats;
  intents: string[];
  selectedIntent: string;
  conversations: ConversationView[];
  activeId: string;
  thread: ThreadView;
  customer: CustomerView;
};

/** Thuộc tính cho nút/ô CHƯA có chức năng: vô hiệu cho trình đọc màn hình + chú thích "Sắp có". */
function soonProps(soon: string) {
  return { 'aria-disabled': true as const, title: soon, tabIndex: -1 };
}

const eyebrow = 'font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant';

/** Đồng hồ cửa sổ 24 giờ: màu theo trạng thái (còn < 2 giờ → cảnh báo). */
export function WindowClock({ kind, minutes }: { kind: MessageWindowKind; minutes: number }) {
  const t = useTranslations('messagesUi.window');
  const { hours, minutes: mins } = splitMinutes(minutes);
  if (kind === 'warning') {
    return (
      <span className="inline-flex animate-pulse items-center gap-1 rounded-full bg-tertiary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-tertiary-fixed shadow-sm">
        <span className="text-tertiary">
          <Icon name="timer" size={12} />
        </span>
        {t('short', { hours, minutes: mins })}
      </span>
    );
  }
  const text =
    kind === 'locked'
      ? t('shortLocked')
      : kind === 'humanAgent'
        ? t('shortHumanAgent')
        : t('short', { hours, minutes: mins });
  return (
    <span
      className={cn(
        'font-label-sm text-label-sm',
        kind === 'locked' ? 'text-error' : 'text-on-surface-variant',
      )}
    >
      {text}
    </span>
  );
}

function PlatformBadge({ platform, large }: { platform: Platform; large?: boolean }) {
  return (
    <span
      className={cn(
        'absolute flex items-center justify-center rounded-full font-bold shadow-sm',
        PLATFORM_BADGE[platform],
        large ? 'bottom-0 right-0 h-5 w-5 text-xs' : '-bottom-1 -right-1 h-4 w-4 text-[10px]',
      )}
    >
      {platformBadgeText(platform)}
    </span>
  );
}

function Initials({
  name,
  platform,
  size,
}: {
  name: string;
  platform: Platform;
  size: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' }[size];
  return (
    <span className="relative shrink-0">
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-primary-fixed font-bold text-on-primary-fixed',
          box,
        )}
      >
        {avatarInitial(name)}
      </span>
      {size === 'sm' ? null : <PlatformBadge platform={platform} large={size === 'lg'} />}
    </span>
  );
}

/** Dải phân luồng phía trên: cảnh báo 24h, chỉ số ca trực và phím tắt. */
function TriageBar({ stats }: { stats: TriageStats }) {
  const t = useTranslations('messagesUi.stats');
  const shortcutLabels = [t('kbdDone'), t('kbdSend'), t('kbdAi')];
  return (
    <div className="flex h-10 shrink-0 items-center justify-between bg-surface-container-high px-space-md text-on-surface shadow-sm">
      <div className="flex items-center gap-space-md">
        <div className="flex items-center gap-1.5 rounded bg-tertiary-fixed px-2 py-0.5 font-label-sm text-label-sm text-on-tertiary-fixed">
          <span className="text-tertiary">
            <Icon name="timer" size={14} />
          </span>
          <span className="font-semibold">{t('nearDeadline', { n: stats.nearDeadline })}</span>
        </div>
        <div className="hidden items-center gap-2 font-label-sm text-label-sm text-on-surface-variant md:flex">
          <span>
            {t('onTime')} <strong className="font-semibold text-primary">{stats.onTimeRate}</strong>
          </span>
          <span>•</span>
          <span>
            {t('avgHandle')}{' '}
            <strong className="font-semibold text-on-surface">{stats.avgHandle}</strong>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          {t('shortcuts')}
        </span>
        {shortcutLabels.map((label) => (
          <span
            key={label}
            className="rounded bg-surface-container-lowest px-1.5 py-0.5 font-code-sm text-code-sm text-on-surface shadow-sm"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Cột 1: tab trạng thái, lọc nhanh nghiệp vụ, thẻ tự động hóa ca trực. */
function StatusColumn({ p }: { p: MessageCenterProps }) {
  const t = useTranslations('messagesUi');
  const soon = t('soon');
  return (
    <section
      aria-label={t('filters.label')}
      className="col-span-2 flex flex-col justify-between overflow-y-auto bg-surface-container-lowest shadow-sm"
    >
      <div className="space-y-space-md p-space-sm">
        <div className="space-y-1">
          <div className={cn('mb-1 px-space-xs', eyebrow)}>{t('inboxHeading')}</div>
          {TAB_KEYS.map((key) => {
            const active = key === p.activeTab;
            const urgent = key === 'nearDeadline';
            return (
              <button
                key={key}
                type="button"
                {...soonProps(soon)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors',
                  urgent &&
                    'bg-tertiary-fixed font-title-sm text-title-sm text-on-tertiary-fixed shadow-sm',
                  active &&
                    !urgent &&
                    'bg-primary-container font-title-sm text-title-sm text-on-primary shadow-sm',
                  !active && !urgent && 'text-on-surface-variant hover:bg-surface-container',
                  key === 'sendFailed' && 'opacity-70',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className={active ? undefined : TAB_ICON_TONE[key]}>
                    <Icon name={TAB_ICONS[key]} size={16} />
                  </span>
                  <span className="truncate">{t(`tabs.${key}`)}</span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-1.5 font-label-sm text-label-sm',
                    active ? TAB_BADGE.pending : TAB_BADGE[key],
                  )}
                >
                  {p.tabCounts[key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="h-px bg-surface-container" />
        <div className="space-y-space-sm">
          <div className={cn('px-space-xs', eyebrow)}>{t('quick.heading')}</div>
          <div className="space-y-1.5 text-on-surface">
            <div>
              <span className="mb-1 block font-label-sm text-label-sm text-on-surface-variant">
                {t('quick.platform')}
              </span>
              <div className="grid grid-cols-3 gap-1">
                {QUICK_PLATFORMS.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    {...soonProps(soon)}
                    className={cn(
                      'flex items-center justify-center gap-1 rounded px-1.5 py-1 font-label-sm text-label-sm',
                      q.active
                        ? 'bg-primary-fixed font-semibold text-on-primary-fixed'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                    )}
                  >
                    {q.active ? <Icon name="public" size={12} /> : null}
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-1">
              <label
                htmlFor="msg-intent"
                className="mb-1 block font-label-sm text-label-sm text-on-surface-variant"
              >
                {t('quick.intent')}
              </label>
              <select
                id="msg-intent"
                disabled
                {...soonProps(soon)}
                defaultValue={p.selectedIntent}
                className="w-full cursor-not-allowed rounded-lg bg-surface-container-low px-2 py-1.5 font-body-sm text-body-sm text-on-surface outline-none"
              >
                <option>{t('quick.allIntents')}</option>
                {p.intents.map((intent) => (
                  <option key={intent}>{intent}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 pt-2">
              <label className="flex cursor-not-allowed items-center gap-2 text-on-surface">
                <input
                  type="checkbox"
                  defaultChecked
                  disabled
                  className="h-4 w-4 rounded accent-primary"
                />
                <span className="font-label-md text-label-md">{t('quick.unreadOnly')}</span>
              </label>
              <label className="flex cursor-not-allowed items-center gap-2 text-on-surface">
                <input type="checkbox" disabled className="h-4 w-4 rounded accent-primary" />
                <span className="font-label-md text-label-md">{t('quick.mineOnly')}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="m-space-xs space-y-1 rounded-xl bg-surface-container-low p-space-sm">
        <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface">
          <span>{t('automation.title')}</span>
          <span className="font-semibold text-secondary">{p.stats.automationPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
          <div
            className="h-full rounded-full bg-secondary"
            style={{ width: `${p.stats.automationPct}%` }}
          />
        </div>
        <span className="block pt-0.5 font-label-sm text-label-sm text-on-surface-variant">
          {t('automation.today', { n: p.stats.autoRepliesToday })}
        </span>
      </div>
    </section>
  );
}

function ConversationRow({ c, active, now }: { c: ConversationView; active: boolean; now: Date }) {
  const t = useTranslations('messagesUi');
  const win = messageWindowState(c.lastCustomerMessageAt, now);
  const previewTone =
    c.previewBy === 'page' ? 'text-primary' : c.previewBy === 'ai' ? 'text-secondary' : '';
  const prefix =
    c.previewBy === 'page'
      ? t('list.youPrefix')
      : c.previewBy === 'ai'
        ? t('list.aiPrefix')
        : t('list.customerPrefix');
  return (
    <article
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative cursor-pointer rounded-xl p-3 transition-all',
        active
          ? 'bg-surface-container shadow-sm'
          : 'bg-surface-container-lowest hover:bg-surface-container-low',
        c.chip === 'pending' && !active && 'opacity-85',
      )}
    >
      {active ? (
        <div className="absolute bottom-2 left-0 top-2 w-1.5 rounded-r bg-primary-container" />
      ) : null}
      <div className="flex items-start gap-2.5">
        <Initials name={c.name} platform={c.platform} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h2
              className={cn(
                'truncate font-title-sm text-title-sm text-on-surface',
                active && 'font-bold',
              )}
            >
              {c.name}
            </h2>
            <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">
              {c.ago}
            </span>
          </div>
          <p
            className={cn(
              'mt-0.5 truncate font-body-sm text-body-sm',
              c.urgentPreview ? 'font-medium text-error' : 'text-on-surface-variant',
            )}
          >
            {c.previewBy === 'customer' && !c.urgentPreview ? null : (
              <span className={cn('font-medium', previewTone)}>{prefix}</span>
            )}{' '}
            {c.preview}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {c.chip === 'needsHuman' ? (
              <span className="flex items-center gap-1 rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-error-container">
                <span className="h-1.5 w-1.5 rounded-full bg-error" />
                {t('chip.needsHuman')}
              </span>
            ) : null}
            {c.chip === 'aiAuto' ? (
              <span className="flex items-center gap-1 rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm text-on-secondary-fixed">
                <Icon name="smart_toy" size={12} />
                {t('chip.aiAuto')}
              </span>
            ) : null}
            {c.chip === 'pending' ? (
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                {t('chip.pending')}
              </span>
            ) : null}
            {c.assignee ? (
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface">
                {c.assignee}
              </span>
            ) : null}
            <WindowClock kind={win.kind} minutes={win.remainingMinutes} />
            {c.intent ? (
              <span
                className={cn(
                  'font-label-sm text-label-sm',
                  active
                    ? 'rounded-full bg-secondary-fixed px-2 py-0.5 font-medium text-on-secondary-fixed'
                    : 'rounded bg-surface-container px-1.5 py-0.5 text-on-surface',
                )}
              >
                {c.intent}
              </span>
            ) : null}
            {c.fromComment ? (
              <span className="flex items-center gap-0.5 rounded bg-surface-container-high px-1.5 py-0.5 font-label-sm text-label-sm text-on-surface">
                <Icon name="chat_bubble_outline" size={11} />
                {t('list.fromComment')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Cột 2: ô tìm, dòng sắp xếp/lọc sâu, danh sách hội thoại. */
function ConversationColumn({ p }: { p: MessageCenterProps }) {
  const t = useTranslations('messagesUi');
  const soon = t('soon');
  return (
    <section
      aria-label={t('list.label')}
      className="col-span-3 flex flex-col overflow-hidden bg-surface-container-lowest shadow-sm"
    >
      <div className="flex shrink-0 flex-col gap-2 bg-surface-container-low p-space-sm">
        <div className="relative">
          <span className="absolute left-2.5 top-2 text-on-surface-variant">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            readOnly
            {...soonProps(soon)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="w-full rounded-lg bg-surface-container-lowest py-1.5 pl-8 pr-3 font-body-sm text-body-sm text-on-surface shadow-sm outline-none placeholder:text-on-surface-variant"
          />
        </div>
        <div className="flex items-center justify-between font-label-sm text-label-sm">
          <span className="text-on-surface-variant">
            {t('sortLabel')} <strong className="text-tertiary">{t('sortValue')}</strong>
          </span>
          <button
            type="button"
            {...soonProps(soon)}
            className="flex items-center gap-0.5 font-semibold text-primary hover:underline"
          >
            <Icon name="tune" size={12} />
            {t('filter')}
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-1">
        {p.conversations.map((c) => (
          <ConversationRow key={c.id} c={c} active={c.id === p.activeId} now={p.now} />
        ))}
      </div>
    </section>
  );
}

function ChatBubble({ m, name, platform }: { m: ThreadMessage; name: string; platform: Platform }) {
  const t = useTranslations('messagesUi');
  if (m.from === 'customer') {
    return (
      <div className="flex max-w-[80%] items-end gap-2">
        <span className="mb-1">
          <Initials name={name} platform={platform} size="sm" />
        </span>
        <div className="space-y-1">
          <div
            className={cn(
              'rounded-2xl rounded-bl-sm bg-surface-container-high p-3 font-body-sm text-body-sm text-on-surface shadow-sm',
              m.urgent && 'font-medium',
            )}
          >
            {m.text}
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">{m.time}</span>
            {m.urgent ? (
              <span className="rounded bg-tertiary-fixed px-1.5 font-label-sm text-label-sm font-bold text-on-tertiary-fixed">
                {t('thread.urgent')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  const ai = m.from === 'ai';
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end space-y-1">
      {ai ? (
        <div className="flex items-center gap-1.5 px-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed px-1.5 font-label-sm text-label-sm font-semibold text-on-secondary-fixed">
            <Icon name="bolt" size={12} />
            {t('thread.aiReplied')}
          </span>
          {m.confidence ? (
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {t('thread.confidence', { value: m.confidence })}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          'space-y-2 rounded-2xl rounded-br-sm p-3.5 text-on-surface shadow-sm',
          ai ? 'bg-secondary-fixed/30' : 'bg-primary-fixed',
        )}
      >
        <p className="font-body-sm text-body-sm">{m.text}</p>
        {m.source ? (
          <div className="flex items-center gap-1 pt-1 font-label-sm text-label-sm text-secondary">
            <Icon name="menu_book" size={12} />
            <span>{t('thread.sourcePrefix', { source: m.source })}</span>
          </div>
        ) : null}
      </div>
      <span className="px-1 font-label-sm text-label-sm text-on-surface-variant">
        {m.time}
        {m.meta ? ` • ${m.meta}` : ''}
      </span>
    </div>
  );
}

/** Cột 3: đầu hội thoại, cảnh báo cửa sổ 24 giờ, luồng tin, gợi ý AI, hộp soạn. */
function ThreadColumn({ p }: { p: MessageCenterProps }) {
  const t = useTranslations('messagesUi');
  const soon = t('soon');
  const active = p.conversations.find((c) => c.id === p.activeId);
  const win = messageWindowState(active?.lastCustomerMessageAt ?? p.now, p.now);
  const { hours, minutes } = splitMinutes(win.remainingMinutes);
  const sendingAs = t.rich('composer.sendingAs', {
    name: `${p.thread.pageName} (${p.thread.staffName})`,
    b: (chunk) => <strong>{chunk}</strong>,
  });
  const warn = win.kind === 'open' || win.kind === 'warning';
  const iconBtn =
    'rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface';
  const toolChip =
    'flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface hover:bg-surface-container-high';
  return (
    <main
      aria-label={t('thread.label')}
      className="col-span-4 flex flex-col overflow-hidden bg-surface shadow-sm"
    >
      <div className="flex h-16 shrink-0 items-center justify-between bg-surface-container-lowest px-space-md shadow-sm">
        <div className="flex items-center gap-3">
          <Initials name={p.customer.name} platform={p.customer.platform} size="md" />
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-title-md text-title-md font-bold text-on-surface">
                {p.customer.name}
              </h1>
              <span className="rounded bg-surface-container px-1.5 font-label-sm text-label-sm text-on-surface-variant">
                {p.customer.channelName}
              </span>
            </div>
            <p className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
              <span>
                {t('thread.page')}: <strong>{p.thread.pageName}</strong>
              </span>
              <span>•</span>
              <span className="font-medium text-primary">{t('thread.startedFromComment')}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-lg bg-surface-container-low px-2.5 py-1 xl:flex">
            <span className="font-label-sm text-label-sm text-on-surface">
              {t('thread.aiAuto')}:
            </span>
            <button
              type="button"
              role="switch"
              aria-checked="true"
              aria-label={t('thread.aiAuto')}
              {...soonProps(soon)}
              className="flex w-8 cursor-not-allowed items-center justify-end rounded-full bg-secondary p-0.5 shadow-inner"
            >
              <span className="h-3.5 w-3.5 rounded-full bg-on-secondary shadow" />
            </button>
            <span className="font-label-sm text-label-sm font-bold text-secondary">
              {t('thread.aiOn')}
            </span>
          </div>
          <button
            type="button"
            {...soonProps(soon)}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-title-sm text-title-sm text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            <Icon name="check" size={14} />
            <span>{t('thread.done')}</span>
          </button>
          <button
            type="button"
            aria-label={t('thread.more')}
            {...soonProps(soon)}
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="more_vert" size={18} />
          </button>
        </div>
      </div>
      <div
        role="status"
        className={cn(
          'flex shrink-0 items-center justify-between px-space-md py-2 shadow-sm',
          win.kind === 'locked'
            ? 'bg-error-container text-on-error-container'
            : 'bg-tertiary-fixed text-on-tertiary-fixed',
        )}
      >
        <div className="flex items-center gap-2 font-label-sm text-label-sm">
          <span className="text-tertiary">
            <Icon name="warning" size={16} />
          </span>
          <span>
            {warn ? t(`window.${win.kind}`, { hours, minutes }) : t(`window.${win.kind}`)}
          </span>
        </div>
        <button
          type="button"
          {...soonProps(soon)}
          className="shrink-0 font-label-sm text-label-sm font-bold text-tertiary hover:underline"
        >
          {t('thread.extend')}
        </button>
      </div>
      <div className="flex-1 space-y-space-md overflow-y-auto p-space-md">
        <div className="my-1 text-center">
          <span className="rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-label-sm text-on-surface-variant">
            {p.thread.dayLabel}
          </span>
        </div>
        <div className="mx-auto max-w-[90%] rounded-xl bg-surface-container-low p-3 shadow-sm">
          <div className="mb-1 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
            <div className="flex items-center gap-1 font-semibold text-primary">
              <Icon name="comment" size={14} />
              <span>{t('thread.quotedFrom')}</span>
            </div>
            <span
              {...soonProps(soon)}
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <span>{t('thread.viewPost')}</span>
              <Icon name="launch" size={12} />
            </span>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-2 font-body-sm text-body-sm text-on-surface shadow-sm">
            <p className="font-medium text-on-surface">{p.thread.quotedComment}</p>
            <span className="mt-1 block font-label-sm text-label-sm text-on-surface-variant">
              {p.thread.quotedPost}
            </span>
            <span className="mt-1 block font-label-sm text-label-sm text-on-surface-variant">
              {t('window.privateReply')}
            </span>
          </div>
        </div>
        {p.thread.messages.map((m) => (
          <ChatBubble
            key={m.time + m.text}
            m={m}
            name={p.customer.name}
            platform={p.customer.platform}
          />
        ))}
      </div>
      <div className="shrink-0 space-y-2 bg-surface-container-lowest p-space-sm shadow-md">
        <div className="space-y-2 rounded-xl bg-surface-container-low p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-secondary">
                <Icon name="auto_awesome" size={16} />
              </span>
              <span className="font-title-sm text-title-sm font-bold text-secondary">
                {t('ai.heading')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t('ai.regenerate')}
                {...soonProps(soon)}
                className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
              >
                <Icon name="refresh" size={16} />
              </button>
              <button
                type="button"
                {...(win.canReply ? soonProps(soon) : { disabled: true })}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-secondary transition-colors hover:bg-secondary-container"
              >
                <Icon name="done" size={12} /> {t('ai.apply')}
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-2 font-body-sm text-body-sm leading-relaxed text-on-surface shadow-sm">
            {p.thread.aiSuggestion}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {t('ai.sources')}
            </span>
            {p.thread.aiSources.map((s, i) => (
              <span
                key={s}
                className="flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface"
              >
                <Icon name={i === 0 ? 'straighten' : 'check_circle'} size={12} />
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-surface-container-low p-2 transition-colors focus-within:bg-surface-container-lowest">
          <div className="flex items-center justify-between px-1 pb-1">
            <div className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
              <button
                type="button"
                aria-label={t('composer.attach')}
                {...soonProps(soon)}
                className={iconBtn}
              >
                <Icon name="attach_file" size={16} />
              </button>
              <button
                type="button"
                aria-label={t('composer.image')}
                {...soonProps(soon)}
                className={iconBtn}
              >
                <Icon name="image" size={16} />
              </button>
              <button
                type="button"
                aria-label={t('composer.emoji')}
                {...soonProps(soon)}
                className={iconBtn}
              >
                <Icon name="sentiment_satisfied" size={16} />
              </button>
              <button type="button" {...soonProps(soon)} className={toolChip}>
                <span className="text-primary">
                  <Icon name="bookmark" size={12} />
                </span>
                {t('composer.template')}
              </button>
              <button type="button" {...soonProps(soon)} className={toolChip}>
                <span className="text-secondary">
                  <Icon name="menu_book" size={12} />
                </span>
                {t('composer.insertKb')}
              </button>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {t('composer.hint')}
            </span>
          </div>
          <textarea
            rows={3}
            disabled={!win.canReply}
            placeholder={t('composer.placeholder')}
            aria-label={t('composer.placeholder')}
            className="w-full resize-none bg-transparent p-1.5 font-body-md text-body-md text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          {win.canReply ? null : (
            <p className="px-1.5 font-label-sm text-label-sm text-error">
              {t('composer.lockedHint')}
            </p>
          )}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              <span>{sendingAs}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                {...soonProps(soon)}
                className="rounded-lg bg-surface-container px-3 py-1.5 font-title-sm text-title-sm text-on-surface transition-colors hover:bg-surface-container-high"
              >
                {t('composer.saveDraft')}
              </button>
              <button
                type="button"
                {...(win.canReply ? soonProps(soon) : { disabled: true })}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 font-title-sm text-title-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
              >
                <span>{t('composer.send')}</span>
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Cột 4: hồ sơ khách hàng (CRM) — thông tin liên hệ, sản phẩm quan tâm, bình luận cũ, ghi chú, thẻ. */
function CustomerColumn({ c }: { c: CustomerView }) {
  const t = useTranslations('messagesUi.customer');
  const ts = useTranslations('messagesUi');
  const soon = ts('soon');
  return (
    <aside
      aria-label={t('label')}
      className="col-span-3 flex flex-col overflow-y-auto bg-surface-container-lowest shadow-sm"
    >
      <div className="flex flex-col items-center bg-surface-container-low p-space-md text-center">
        <span className="mb-2">
          <Initials name={c.name} platform={c.platform} size="lg" />
        </span>
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{c.name}</h2>
        <span className="font-label-sm text-label-sm font-semibold text-primary">{c.stage}</span>
        <div className="mt-space-md grid w-full grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-container-lowest p-2 text-center shadow-sm">
            <span className="block font-label-sm text-label-sm text-on-surface-variant">
              {t('interactions')}
            </span>
            <span className="font-title-md text-title-md font-bold text-on-surface">
              {c.interactions}
            </span>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-2 text-center shadow-sm">
            <span className="block font-label-sm text-label-sm text-on-surface-variant">
              {t('firstContact')}
            </span>
            <span className="font-title-md text-title-md font-bold text-on-surface">
              {c.firstContact}
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-space-md p-space-md">
        <div className="space-y-1.5">
          <div className={eyebrow}>{t('contactInfo')}</div>
          <div className="space-y-2 rounded-lg bg-surface-container-low p-2.5 font-body-sm text-body-sm text-on-surface">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">{t('channel')}:</span>
              <span className="font-semibold text-primary">{c.channelName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">{t('userId')}:</span>
              <span className="font-code-sm text-code-sm">{c.userId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">{t('area')}:</span>
              <span>{c.area}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">{t('orderHistory')}:</span>
              <span className="font-semibold text-tertiary">{t('noOrder')}</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className={eyebrow}>{t('interestedProduct')}</div>
          <div className="flex items-start gap-2.5 rounded-xl bg-surface-container-low p-2.5 shadow-sm">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant"
            >
              <Icon name="image" size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-title-sm text-title-sm font-semibold text-on-surface">
                {c.product.name}
              </h3>
              <p className="font-code-sm text-code-sm text-on-surface-variant">
                {t('sku', { sku: c.product.sku })}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-title-sm text-title-sm font-bold text-primary">
                  {c.product.price}
                </span>
                <span className="rounded bg-surface-container-high px-1.5 font-label-sm text-label-sm text-on-surface">
                  {t('inStock', { n: c.product.stock })}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-label-sm text-label-sm">
            <span className="uppercase tracking-wider text-on-surface-variant">
              {t('commentsOnPage', { n: c.pastComments.length })}
            </span>
            <span {...soonProps(soon)} className="text-primary hover:underline">
              {t('details')}
            </span>
          </div>
          <div className="space-y-2">
            {c.pastComments.map((pc) => (
              <div
                key={pc.post + pc.time}
                className={cn(
                  'rounded-lg p-2 font-body-sm text-body-sm text-on-surface',
                  pc.linked ? 'bg-surface-container' : 'bg-surface-container-low opacity-80',
                )}
              >
                <div className="mb-1 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                  <span>{pc.post}</span>
                  <span>{pc.time}</span>
                </div>
                <p className={pc.linked ? 'font-medium text-on-surface' : 'text-on-surface'}>
                  {pc.text}
                </p>
                <span
                  className={cn(
                    'mt-1 inline-block text-[11px]',
                    pc.linked ? 'font-semibold text-primary' : 'text-on-surface-variant',
                  )}
                >
                  {pc.note}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between font-label-sm text-label-sm">
            <span className="uppercase tracking-wider text-on-surface-variant">
              {t('internalNote')}
            </span>
            <span className="text-on-surface-variant">{t('staffOnly')}</span>
          </div>
          <div className="space-y-2">
            <textarea
              rows={3}
              readOnly
              {...soonProps(soon)}
              defaultValue={c.note}
              placeholder={t('notePlaceholder')}
              aria-label={t('internalNote')}
              className="w-full resize-none rounded-lg bg-surface-container-low p-2 font-body-sm text-body-sm text-on-surface shadow-inner outline-none placeholder:text-on-surface-variant"
            />
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {t('updatedBy', { by: c.noteUpdatedBy })}
              </span>
              <button
                type="button"
                {...soonProps(soon)}
                className="rounded bg-surface-container-highest px-3 py-1 font-title-sm text-title-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                {t('saveNote')}
              </button>
            </div>
          </div>
        </div>
        <div className="pt-1">
          <span className={cn('mb-1.5 block', eyebrow)}>{t('tags')}</span>
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((tag, i) => (
              <span
                key={tag}
                className={cn(
                  'rounded-full px-2 py-0.5 font-label-sm text-label-sm font-medium',
                  i === 0
                    ? 'bg-primary-fixed text-on-primary-fixed'
                    : 'bg-tertiary-fixed text-on-tertiary-fixed',
                )}
              >
                {tag}
              </span>
            ))}
            <span
              {...soonProps(soon)}
              className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm font-medium text-on-surface"
            >
              {t('addTag')}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Trang Tin nhắn 4 cột theo design/stitch/messages.html — chỉ vỏ giao diện, chưa gửi/nhận thật. */
export function MessageCenter(p: MessageCenterProps) {
  return (
    <div className="tw">
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden">
        <TriageBar stats={p.stats} />
        <div className="grid flex-1 grid-cols-12 overflow-hidden bg-background">
          <StatusColumn p={p} />
          <ConversationColumn p={p} />
          <ThreadColumn p={p} />
          <CustomerColumn c={p.customer} />
        </div>
      </div>
    </div>
  );
}

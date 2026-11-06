import { useTranslations } from 'next-intl';
import { avatarInitial, platformBadgeText } from '../../lib/inbox-visual';
import { type MessageWindowKind, messageWindowState, splitMinutes } from '../../lib/message-window';
import { Avatar } from '../ui/avatar';

/** Dữ liệu hiển thị (vỏ giao diện: chưa có kênh nhắn tin thật; trang dev truyền dữ liệu MẪU có nhãn "[MẪU]"). */
export type ConversationView = {
  id: string;
  name: string;
  platform: 'facebook' | 'instagram' | 'tiktok';
  preview: string;
  previewBy: 'customer' | 'page' | 'ai';
  ago: string;
  lastCustomerMessageAt: Date;
  chip: 'needsHuman' | 'aiAuto' | 'pending' | null;
  fromComment: boolean;
};

export type CustomerView = {
  name: string;
  platform: 'facebook' | 'instagram' | 'tiktok';
  stage: string;
  interactions: string;
  firstContact: string;
  channelName: string;
  userId: string;
  area: string;
  product: { name: string; sku: string; price: string; stock: number };
  tags: string[];
  note: string;
};

export type ThreadView = {
  quotedComment: string;
  messages: { from: 'customer' | 'page'; text: string; time: string }[];
  aiSuggestion: string;
  aiSources: string[];
  pageName: string;
  staffName: string;
};

const TAB_KEYS = [
  'nearDeadline',
  'pending',
  'needsHuman',
  'aiReplying',
  'willAutoSend',
  'done',
  'all',
] as const;

export type MessageCenterProps = {
  now: Date;
  activeTab: (typeof TAB_KEYS)[number];
  tabCounts: Record<(typeof TAB_KEYS)[number], number>;
  conversations: ConversationView[];
  activeId: string;
  thread: ThreadView;
  customer: CustomerView;
};

/** Đồng hồ cửa sổ 24 giờ: màu theo trạng thái (còn < 2 giờ → cảnh báo). */
export function WindowClock({ kind, minutes }: { kind: MessageWindowKind; minutes: number }) {
  const t = useTranslations('messagesUi.window');
  const { hours, minutes: mins } = splitMinutes(minutes);
  if (kind === 'locked' || kind === 'humanAgent') {
    return (
      <span className={`msg-clock msg-clock-${kind}`}>
        {t(kind === 'locked' ? 'shortLocked' : 'shortHumanAgent')}
      </span>
    );
  }
  return (
    <span className={`msg-clock msg-clock-${kind}`}>{t('short', { hours, minutes: mins })}</span>
  );
}

function ConversationRow({ c, active, now }: { c: ConversationView; active: boolean; now: Date }) {
  const t = useTranslations('messagesUi');
  const win = messageWindowState(c.lastCustomerMessageAt, now);
  const prefix =
    c.previewBy === 'page'
      ? `${t('list.youPrefix')}: `
      : c.previewBy === 'ai'
        ? `${t('list.aiPrefix')}: `
        : '';
  return (
    <li
      className={active ? 'msg-row msg-row-active' : 'msg-row'}
      aria-current={active ? 'true' : undefined}
    >
      <Avatar badge={platformBadgeText(c.platform)}>{avatarInitial(c.name)}</Avatar>
      <div className="msg-row-body">
        <p className="msg-row-head">
          <strong>{c.name}</strong>
          <span className="muted">{c.ago}</span>
        </p>
        <p className="msg-row-preview">
          {prefix}
          {c.preview}
        </p>
        <p className="msg-row-chips">
          <WindowClock kind={win.kind} minutes={win.remainingMinutes} />
          {c.chip ? (
            <span className={`msg-chip msg-chip-${c.chip}`}>{t(`chip.${c.chip}`)}</span>
          ) : null}
          {c.fromComment ? <span className="msg-chip">{t('list.fromComment')}</span> : null}
        </p>
      </div>
    </li>
  );
}

function ConversationColumn({ p }: { p: MessageCenterProps }) {
  const t = useTranslations('messagesUi');
  return (
    <section className="msg-col msg-col-list" aria-label={t('list.label')}>
      <p className="msg-eyebrow">{t('inboxHeading')}</p>
      <ul className="msg-tabs">
        {TAB_KEYS.map((key) => (
          <li key={key} className={key === p.activeTab ? 'msg-tab msg-tab-active' : 'msg-tab'}>
            <span>{t(`tabs.${key}`)}</span>
            <span className="msg-count">{p.tabCounts[key]}</span>
          </li>
        ))}
      </ul>
      <input
        type="search"
        className="msg-search"
        placeholder={t('search')}
        aria-label={t('search')}
        readOnly
      />
      <p className="msg-sortline">
        <span>{t('sortLabel')}</span>
        <span>{t('filter')}</span>
      </p>
      <ul className="msg-rows">
        {p.conversations.map((c) => (
          <ConversationRow key={c.id} c={c} active={c.id === p.activeId} now={p.now} />
        ))}
      </ul>
    </section>
  );
}

function ThreadColumn({ p }: { p: MessageCenterProps }) {
  const t = useTranslations('messagesUi');
  const active = p.conversations.find((c) => c.id === p.activeId);
  const win = messageWindowState(active?.lastCustomerMessageAt ?? p.now, p.now);
  const { hours, minutes } = splitMinutes(win.remainingMinutes);
  return (
    <section className="msg-col msg-col-thread" aria-label={t('thread.label')}>
      <header className="msg-thread-head">
        <div>
          <h2>{p.customer.name}</h2>
          <p className="muted">
            {t('thread.channel')}: {p.customer.channelName}
          </p>
        </div>
        <span className="msg-ai-toggle">
          {t('thread.aiAuto')}: <strong>{t('thread.aiOn')}</strong>
        </span>
        <button type="button" className="btn btn-primary" disabled>
          {t('thread.done')}
        </button>
      </header>
      <p className={`msg-window-banner msg-window-${win.kind}`} role="status">
        {win.kind === 'open' || win.kind === 'warning'
          ? t(`window.${win.kind}`, { hours, minutes })
          : t(`window.${win.kind}`)}
      </p>
      <div className="msg-thread">
        <blockquote className="msg-quote">
          <p className="msg-quote-head">{t('thread.quotedFrom')}</p>
          <p>{p.thread.quotedComment}</p>
          <p className="muted">{t('window.privateReply')}</p>
        </blockquote>
        {p.thread.messages.map((m) => (
          <div
            key={m.time + m.text}
            className={m.from === 'customer' ? 'msg-bubble' : 'msg-bubble msg-bubble-page'}
          >
            <p>{m.text}</p>
            <span className="muted">{m.time}</span>
          </div>
        ))}
      </div>
      <div className="msg-ai-box">
        <p className="msg-ai-head msg-ai-head-spark">
          {t('ai.heading')}
          <button type="button" className="btn btn-primary msg-ai-apply" disabled={!win.canReply}>
            {t('ai.apply')}
          </button>
        </p>
        <p className="msg-ai-text">{p.thread.aiSuggestion}</p>
        <p className="muted">{t('ai.sources')}</p>
        <ul className="msg-sources">
          {p.thread.aiSources.map((s) => (
            <li key={s} className="msg-chip">
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div className="msg-composer">
        <p className="msg-composer-tools">
          <span className="msg-chip">{t('composer.template')}</span>
          <span className="msg-chip">{t('composer.insertKb')}</span>
          <span className="muted">{t('composer.hint')}</span>
        </p>
        <textarea
          className="msg-composer-input"
          rows={3}
          placeholder={t('composer.placeholder')}
          aria-label={t('composer.placeholder')}
          disabled={!win.canReply}
        />
        {win.canReply ? null : <p className="muted">{t('composer.lockedHint')}</p>}
        <div className="msg-composer-foot">
          <span className="muted">
            {t('composer.sendingAs', { page: p.thread.pageName, staff: p.thread.staffName })}
          </span>
          <button type="button" className="btn" disabled>
            {t('composer.saveDraft')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!win.canReply}>
            {t('composer.send')}
          </button>
        </div>
      </div>
    </section>
  );
}

function CustomerColumn({ c }: { c: CustomerView }) {
  const t = useTranslations('messagesUi.customer');
  return (
    <aside className="msg-col msg-col-customer" aria-label={t('label')}>
      <div className="msg-customer-top">
        <Avatar size="lg" badge={platformBadgeText(c.platform)}>
          {avatarInitial(c.name)}
        </Avatar>
        <h2>{c.name}</h2>
        <p className="msg-stage">{c.stage}</p>
      </div>
      <div className="msg-kpis">
        <div>
          <p className="muted">{t('interactions')}</p>
          <strong>{c.interactions}</strong>
        </div>
        <div>
          <p className="muted">{t('firstContact')}</p>
          <strong>{c.firstContact}</strong>
        </div>
      </div>
      <h3 className="msg-eyebrow">{t('contactInfo')}</h3>
      <dl className="msg-dl">
        <dt>{t('channel')}</dt>
        <dd>{c.channelName}</dd>
        <dt>{t('userId')}</dt>
        <dd>{c.userId}</dd>
        <dt>{t('area')}</dt>
        <dd>{c.area}</dd>
        <dt>{t('orderHistory')}</dt>
        <dd className="msg-warn-text">{t('noOrder')}</dd>
      </dl>
      <h3 className="msg-eyebrow">{t('interestedProduct')}</h3>
      <div className="msg-product">
        <span className="msg-product-img" aria-hidden="true" />
        <div>
          <strong>{c.product.name}</strong>
          <p className="muted">{t('sku', { sku: c.product.sku })}</p>
          <p>
            <strong className="msg-price">{c.product.price}</strong>{' '}
            <span className="msg-chip">{t('inStock', { n: c.product.stock })}</span>
          </p>
        </div>
      </div>
      <h3 className="msg-eyebrow">
        {t('internalNote')} <span className="muted">{t('staffOnly')}</span>
      </h3>
      <p className="msg-note">{c.note}</p>
      <button type="button" className="btn" disabled>
        {t('saveNote')}
      </button>
      <h3 className="msg-eyebrow">{t('tags')}</h3>
      <ul className="msg-sources">
        {c.tags.map((tag) => (
          <li key={tag} className="msg-chip">
            {tag}
          </li>
        ))}
        <li className="msg-chip msg-chip-ghost">{t('addTag')}</li>
      </ul>
    </aside>
  );
}

/** Trang Tin nhắn 3 cột theo design/stitch/messages.png — chỉ vỏ giao diện, chưa gửi/nhận thật. */
export function MessageCenter(p: MessageCenterProps) {
  return (
    <div className="msg-layout">
      <ConversationColumn p={p} />
      <ThreadColumn p={p} />
      <CustomerColumn c={p.customer} />
    </div>
  );
}

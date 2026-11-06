import type { LeadRow } from '@flow/db/runtime';
import { isLocale, type LeadStage } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatRelativeTime } from '../../lib/inbox-format';
import { type LeadCardModel, type LeadTone, STAGE_TONE } from '../../lib/lead-card';
import { groupLeadsByStage, LEAD_STAGES, leadInitials, maskedPhone } from '../../lib/lead-view';
import { Icon } from '../ui/icon';
import { Badge, SoonButton } from '../ui/tw-parts';

type LeadsT = Awaited<ReturnType<typeof getTranslations<'leads'>>>;

const AVATAR: Record<LeadTone, string> = {
  primary: 'bg-primary-container text-on-primary',
  secondary: 'bg-secondary-fixed text-on-secondary-fixed',
  tertiary: 'bg-tertiary-fixed text-on-tertiary-fixed',
  neutral: 'bg-surface-container text-on-surface',
  strong: 'bg-surface-container-high text-on-surface-variant',
  error: 'bg-error-container text-on-error-container',
};
const DOT = {
  primary: 'bg-primary-container',
  secondary: 'bg-secondary',
  outline: 'bg-outline',
} as const;
const BADGE: Record<
  LeadTone,
  'primary' | 'secondary' | 'tertiary' | 'error' | 'neutral' | 'strong'
> = {
  primary: 'primary',
  secondary: 'secondary',
  tertiary: 'tertiary',
  neutral: 'neutral',
  strong: 'strong',
  error: 'error',
};

/** Thẻ khách (design/stitch/leads.html): đầu thẻ, ô SĐT, khối sản phẩm/ghi chú, chân thẻ. Trường vắng thì không vẽ. */
async function LeadCard({ lead, soon }: { lead: LeadCardModel; soon: string }) {
  const t = await getTranslations('leads');
  const p = lead.product;
  return (
    <article
      aria-label={lead.name}
      className={`cursor-pointer space-y-space-sm rounded-xl bg-surface-container-lowest p-space-md transition-all ${
        lead.focused ? 'shadow-md' : 'shadow-sm hover:shadow-md'
      } ${lead.muted ? 'opacity-85' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-title-sm text-title-sm ${AVATAR[lead.avatarTone]}`}
          >
            {lead.initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate font-title-md text-title-md text-on-surface">
                {lead.name}
              </span>
              {lead.verified ? (
                <span className="text-primary" title={t('ui.card.verified')}>
                  <Icon name="verified" size={12} />
                </span>
              ) : null}
            </div>
            {lead.channel ? (
              <div className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                <span className={`h-2 w-2 rounded-full ${DOT[lead.channel.dot]}`} />
                <span className="truncate">{lead.channel.label}</span>
              </div>
            ) : null}
          </div>
        </div>
        {lead.badge ? (
          <Badge variant="box" tone={BADGE[lead.badge.tone]} className="shrink-0">
            {lead.badge.tone === 'secondary' ? <Icon name="smart_toy" size={12} /> : null}
            {lead.badge.text}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-2">
        <div className="flex items-center gap-1.5">
          <span className="text-primary">
            <Icon name="call" size={14} />
          </span>
          <span className="font-title-sm text-title-sm font-semibold tracking-wide text-on-surface">
            {lead.phone ?? t('card.noPhone')}
          </span>
        </div>
        {lead.phoneNote ? (
          <span
            className={`font-label-sm text-label-sm ${lead.phoneNote.tone === 'primary' ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            {lead.phoneNote.text}
          </span>
        ) : null}
        {lead.phoneActions ? (
          <div className="flex items-center gap-1">
            <SoonButton variant="icon" soon={soon} label={t('ui.card.copy')} className="p-1">
              <Icon name="content_copy" size={14} />
            </SoonButton>
            <SoonButton
              variant="icon"
              soon={soon}
              label={t('ui.card.call')}
              className="bg-primary-container p-1 text-on-primary"
            >
              <Icon name="phone_in_talk" size={14} />
            </SoonButton>
          </div>
        ) : null}
      </div>

      {p ? (
        <div className="space-y-1 rounded-lg bg-surface-container/50 p-2 font-body-sm text-body-sm text-on-surface-variant">
          <div className="flex items-start justify-between text-on-surface">
            <span className="truncate font-title-sm text-title-sm">{p.title}</span>
            {p.extra ? (
              <span className="shrink-0 font-label-sm text-label-sm font-semibold text-primary">
                {p.extra}
              </span>
            ) : null}
            {p.price ? (
              <span className="shrink-0 font-title-sm text-title-sm text-primary">{p.price}</span>
            ) : null}
          </div>
          {p.meta || p.place ? (
            <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
              <span>{p.meta}</span>
              {p.place ? <span className="text-on-surface">{p.place}</span> : null}
            </div>
          ) : null}
          {p.note ? (
            <div className="space-y-0.5 rounded bg-tertiary-fixed/30 p-2 font-label-sm text-label-sm text-on-tertiary-container">
              <div className="flex items-center gap-1 font-semibold">
                <Icon name="notes" size={12} />
                {t('ui.card.csNote')}
              </div>
              <p className="italic">“{p.note}”</p>
            </div>
          ) : null}
          {p.callback ? (
            <div className="flex items-center gap-1 pt-1 font-label-sm text-label-sm text-tertiary">
              <Icon name="alarm" size={12} />
              <span>
                {t('ui.card.callback')} <strong>{p.callback}</strong>
              </span>
            </div>
          ) : null}
          {p.quote ? (
            <p
              className={`font-label-sm text-label-sm ${p.quoteTone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}
            >
              {p.quote}
            </p>
          ) : null}
        </div>
      ) : null}

      {lead.origin ? (
        <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
          <span className="text-secondary">
            <Icon name="visibility_off" size={12} />
          </span>
          <span className="truncate">{lead.origin}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-1 font-label-sm text-label-sm text-on-surface-variant">
        <span>{lead.time}</span>
        {lead.claim ? (
          <SoonButton variant="mini" soon={soon} className="bg-primary-container text-on-primary">
            {t('ui.card.claim')}
          </SoonButton>
        ) : lead.assignee ? (
          <div className="flex items-center gap-1 text-on-surface">
            <span className="text-primary">
              <Icon name="person" size={12} />
            </span>
            <span>{lead.assignee}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Chuyển một dòng `leads` thật sang mô hình thẻ: chỉ các trường có thật (tên, nguồn, 4 số cuối SĐT, ghi chú, giờ, đã giao). */
function toCard(lead: LeadRow, t: LeadsT, locale: 'vi' | 'en', now: Date): LeadCardModel {
  const name = lead.name ?? t('card.unknownName');
  return {
    id: lead.id,
    stage: lead.stage,
    initials: leadInitials(lead.name),
    avatarTone:
      lead.stage === 'new' ? 'primary' : lead.stage === 'contacted' ? 'tertiary' : 'neutral',
    name,
    badge: {
      text: t(`card.source.${lead.sourceType}`),
      tone: lead.sourceType === 'comment' ? 'secondary' : 'neutral',
    },
    phone: maskedPhone(lead.phoneLast4),
    phoneNote: lead.hasEmail ? { text: t('card.hasEmail'), tone: 'muted' } : undefined,
    product: lead.note ? { title: lead.note } : undefined,
    time: formatRelativeTime(lead.createdAt, now, locale),
    assignee: lead.assignedTo ? t('card.assigned') : undefined,
  };
}

/**
 * Bảng Kanban 4 cột (design/stitch/leads.html), CHỈ ĐỌC. `counts` là tổng thật theo giai đoạn; thẻ hiển thị là lead
 * mới nhất đã tải. Khi `sampleCards` có giá trị (bản dev/dev-ui) thẻ lấy từ dữ liệu mẫu `[MẪU]` thay cho dữ liệu thật.
 */
export async function LeadBoard({
  leads,
  counts,
  sampleCards,
}: {
  leads: LeadRow[];
  counts: Record<LeadStage, number>;
  sampleCards?: readonly LeadCardModel[];
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('leads'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const now = new Date();
  const soon = t('ui.soon');
  const cards: LeadCardModel[] = sampleCards
    ? [...sampleCards]
    : leads.map((lead) => toCard(lead, t, locale, now));
  const byStage = (stage: LeadStage) => cards.filter((card) => card.stage === stage);
  const realGrouped = groupLeadsByStage(leads);
  return (
    <div className="col-span-12 grid min-w-0 grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4 xl:col-span-8">
      {LEAD_STAGES.map((stage) => {
        const column = byStage(stage);
        const shownReal = sampleCards ? column.length : realGrouped[stage].length;
        return (
          <section
            key={stage}
            aria-label={t(`stages.${stage}`)}
            className="flex min-w-0 flex-col gap-space-sm rounded-xl bg-surface-container-low/60 p-space-sm"
          >
            <header className="flex items-center justify-between px-1 py-1">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${STAGE_TONE[stage].dot}`}
                  aria-hidden="true"
                />
                <h2 className="truncate font-title-sm text-title-sm text-on-surface">
                  {t(`stages.${stage}`)}
                </h2>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${STAGE_TONE[stage].count}`}
              >
                {counts[stage]}
              </span>
            </header>
            {column.length === 0 ? (
              <p className="px-1 py-2 font-body-sm text-body-sm text-on-surface-variant">
                {t('emptyColumn')}
              </p>
            ) : (
              column.map((card) => <LeadCard key={card.id} lead={card} soon={soon} />)
            )}
            {counts[stage] > shownReal ? (
              <p className="px-1 font-label-sm text-label-sm text-on-surface-variant">
                {t('moreInColumn', { shown: shownReal, total: counts[stage] })}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

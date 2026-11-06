import { isLocale, type LeadStage } from '@flow/shared';
import type { LeadRow } from '@flow/db/runtime';
import { Mail, Phone, StickyNote } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { groupLeadsByStage, LEAD_STAGES, leadInitials, maskedPhone } from '../../lib/lead-view';
import { formatRelativeTime } from '../../lib/inbox-format';
import { Avatar } from '../ui/avatar';
import { Chip } from '../ui/chip';

type LeadsT = Awaited<ReturnType<typeof getTranslations<'leads'>>>;

function LeadCard({
  lead,
  t,
  locale,
  now,
}: {
  lead: LeadRow;
  t: LeadsT;
  locale: 'vi' | 'en';
  now: Date;
}) {
  const name = lead.name ?? t('card.unknownName');
  const phone = maskedPhone(lead.phoneLast4);
  return (
    <article className="lead-card" aria-label={name}>
      <header className="lead-card-head">
        <Avatar>{leadInitials(lead.name)}</Avatar>
        <div className="lead-card-who">
          <strong className="lead-card-name">{name}</strong>
          <Chip tone={lead.sourceType === 'comment' ? 'info' : 'muted'}>
            {t(`card.source.${lead.sourceType}`)}
          </Chip>
        </div>
      </header>
      <div className="lead-card-contact">
        <Phone size={14} aria-hidden="true" />
        <span>{phone ?? t('card.noPhone')}</span>
        {lead.hasEmail ? (
          <span className="lead-card-email" title={t('card.hasEmail')}>
            <Mail size={14} aria-hidden="true" />
            <span className="visually-hidden">{t('card.hasEmail')}</span>
          </span>
        ) : null}
      </div>
      {lead.note ? (
        <p className="lead-card-note">
          <StickyNote size={14} aria-hidden="true" />
          <span>{lead.note}</span>
        </p>
      ) : null}
      <footer className="lead-card-foot">
        <time dateTime={lead.createdAt.toISOString()}>
          {formatRelativeTime(lead.createdAt, now, locale)}
        </time>
        {lead.assignedTo ? <Chip tone="success">{t('card.assigned')}</Chip> : null}
      </footer>
    </article>
  );
}

/**
 * Bảng Kanban 4 cột, CHỈ ĐỌC (design/stitch/leads.html). `counts` là tổng thật theo giai đoạn; thẻ hiển thị là
 * lead mới nhất đã tải, nên cột có thể ít thẻ hơn số đếm (nói rõ ở chân cột).
 */
export async function LeadBoard({
  leads,
  counts,
}: {
  leads: LeadRow[];
  counts: Record<LeadStage, number>;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('leads'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const now = new Date();
  const grouped = groupLeadsByStage(leads);
  return (
    <div className="lead-board">
      {LEAD_STAGES.map((stage) => (
        <section key={stage} className="lead-col" aria-label={t(`stages.${stage}`)}>
          <header className="lead-col-head">
            <span className={`lead-col-dot lead-col-dot-${stage}`} aria-hidden="true" />
            <h2 className="lead-col-title">{t(`stages.${stage}`)}</h2>
            <span className="lead-col-count">{counts[stage]}</span>
          </header>
          {grouped[stage].length === 0 ? (
            <p className="lead-col-empty">{t('emptyColumn')}</p>
          ) : (
            grouped[stage].map((lead) => (
              <LeadCard key={lead.id} lead={lead} t={t} locale={locale} now={now} />
            ))
          )}
          {counts[stage] > grouped[stage].length ? (
            <p className="lead-col-more">
              {t('moreInColumn', { shown: grouped[stage].length, total: counts[stage] })}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

import type { LeadRow } from '@flow/db/runtime';
import type { LeadStage } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import { LEAD_STAGES } from '../../lib/lead-view';
import { Banner } from '../ui/banner';
import { Stat } from '../ui/stat';
import { LeadBoard } from './lead-board';

/** Thân trang Khách tiềm năng (số liệu + Kanban), chỉ nhận dữ liệu đã tải — dùng chung trang thật và trang mẫu dev. */
export async function LeadsView({
  leads,
  counts,
}: {
  leads: LeadRow[];
  counts: Record<LeadStage, number>;
}) {
  const t = await getTranslations('leads');
  const total = LEAD_STAGES.reduce((sum, stage) => sum + counts[stage], 0);
  return (
    <>
      <section className="info-tiles" aria-label={t('kpi.label')}>
        <Stat label={t('kpi.total')} value={total} />
        {LEAD_STAGES.map((stage) => (
          <Stat key={stage} label={t(`stages.${stage}`)} value={counts[stage]} />
        ))}
      </section>
      {total === 0 ? (
        <Banner>
          <strong>{t('empty.title')}</strong> {t('empty.body')}
        </Banner>
      ) : null}
      <LeadBoard leads={leads} counts={counts} />
    </>
  );
}

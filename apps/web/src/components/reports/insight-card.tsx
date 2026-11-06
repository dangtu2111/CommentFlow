import { getTranslations } from 'next-intl/server';
import { KPI_SAMPLE } from '../../lib/reports-sample';
import { Icon } from '../ui/icon';
import { Badge, SoonButton } from '../ui/tw-parts';

/** Hộp "Đề xuất tối ưu Cơ sở kiến thức" (§5 của reports.html). Gợi ý AI chưa có nguồn → `[MẪU]` ở dev, còn lại là chú thích trống. */
export async function InsightCard({ sample }: { sample: boolean }) {
  const t = await getTranslations('reports');
  const soon = t('ui.soon');
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-surface-container-low via-secondary-fixed/30 to-surface-container-lowest p-space-lg shadow-sm">
      <div className="relative z-10 flex flex-col items-start justify-between gap-space-md md:flex-row md:items-center">
        <div className="flex items-start gap-space-md">
          <div className="shrink-0 rounded-xl bg-secondary p-2.5 text-on-secondary shadow-sm">
            <Icon name="auto_fix_high" size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-title-md text-title-md font-bold text-on-surface">
                {t('ui.insight.title')}
              </span>
              <Badge tone="error" className="font-semibold">
                {t('ui.insight.urgent')}
              </Badge>
              {sample ? <Badge tone="neutral">{t('ui.sampleTag')}</Badge> : null}
            </div>
            {sample ? (
              <>
                <p className="font-body-md text-body-md text-on-surface">
                  {t('ui.insight.struggle')}{' '}
                  <span className="font-semibold text-primary">“{KPI_SAMPLE.insightQuestion}”</span>
                  . {t('ui.insight.asked', { n: KPI_SAMPLE.insightAsked })}
                </p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('ui.insight.gain', {
                    pct: KPI_SAMPLE.insightGain,
                    hours: KPI_SAMPLE.insightHours,
                  })}
                </p>
              </>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t('ui.insight.empty')}
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 md:w-auto">
          <SoonButton
            variant="primary"
            soon={soon}
            className="w-full bg-secondary font-semibold text-on-secondary shadow-sm md:w-auto"
          >
            <Icon name="add_circle" size={14} />
            <span>{t('ui.insight.add')}</span>
          </SoonButton>
          <SoonButton variant="icon" soon={soon} label={t('ui.insight.dismiss')}>
            <Icon name="close" size={16} />
          </SoonButton>
        </div>
      </div>
    </div>
  );
}

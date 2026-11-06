import { getTranslations } from 'next-intl/server';
import { donutArcs, INTENT_SAMPLE, KPI_SAMPLE } from '../../lib/reports-sample';
import { Icon } from '../ui/icon';
import { Badge, Meter, Panel, SoonButton } from '../ui/tw-parts';

const STROKE = {
  primary: 'text-primary-container',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary-container',
  error: 'text-error',
  outline: 'text-outline',
} as const;
const DOT = {
  primary: 'bg-primary-container',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary-container',
  error: 'bg-error',
  outline: 'bg-outline',
} as const;
const PCT = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  error: 'text-error',
  outline: 'text-on-surface-variant',
} as const;

/** Vành khuyên + danh sách nhãn ý định (§3 của reports.html). Chưa có nhãn ý định thật → `[MẪU]` ở dev. */
export async function IntentCard({ sample }: { sample: boolean }) {
  const t = await getTranslations('reports');
  const arcs = donutArcs(INTENT_SAMPLE);
  return (
    <Panel size="lg" className="flex flex-col justify-between space-y-space-md lg:col-span-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-title-md text-title-md font-semibold text-on-surface">
            {t('ui.intent.title')}
            {sample ? <Badge tone="neutral">{t('ui.sampleTag')}</Badge> : null}
          </h2>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            {t('ui.intent.subtitle')}
          </p>
        </div>
        <span className="text-on-surface-variant">
          <Icon name="pie_chart" size={18} />
        </span>
      </div>
      {sample ? (
        <div className="grid grid-cols-1 items-center gap-space-md py-2 sm:grid-cols-12">
          <div className="relative flex justify-center sm:col-span-5">
            <svg
              className="h-36 w-36 -rotate-90"
              viewBox="0 0 100 100"
              role="img"
              aria-label={t('ui.intent.chartLabel')}
            >
              <circle
                className="text-surface-container"
                cx="50"
                cy="50"
                fill="transparent"
                r="38"
                stroke="currentColor"
                strokeWidth="12"
              />
              {INTENT_SAMPLE.map((slice, i) => (
                <circle
                  key={slice.label}
                  className={STROKE[slice.tone]}
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r="38"
                  stroke="currentColor"
                  strokeDasharray={`${arcs[i]?.dash ?? 0} ${arcs[i]?.circumference ?? 0}`}
                  strokeDashoffset={arcs[i]?.offset ?? 0}
                  strokeWidth="12"
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                {INTENT_SAMPLE.length}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {t('ui.intent.groups')}
              </span>
            </div>
          </div>
          <div className="space-y-2.5 sm:col-span-7">
            {INTENT_SAMPLE.map((slice) => (
              <div key={slice.label}>
                <div className="mb-1 flex items-center justify-between font-label-sm text-label-sm">
                  <span className="flex items-center gap-1.5 font-medium text-on-surface">
                    <span className={`h-2 w-2 rounded-full ${DOT[slice.tone]}`} />
                    {slice.label}
                  </span>
                  <span className={`font-bold ${PCT[slice.tone]}`}>
                    {slice.pct}%{' '}
                    {slice.hint ? (
                      <span className="font-label-sm font-normal text-on-surface-variant">
                        {slice.hint}
                      </span>
                    ) : null}
                  </span>
                </div>
                <Meter pct={slice.pct} tone={slice.tone} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="flex h-36 items-center justify-center rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">
          {t('ui.intent.empty')}
        </p>
      )}
      <div className="flex items-center justify-between rounded-lg bg-secondary-fixed/50 p-space-sm text-on-secondary-fixed">
        <div className="flex items-center gap-2">
          <Icon name="psychology" size={14} />
          <span className="font-label-sm text-label-sm">
            {t('ui.intent.accuracy', { pct: sample ? KPI_SAMPLE.intentF1 : '—' })}
          </span>
        </div>
        <SoonButton variant="link" soon={t('ui.soon')} className="text-secondary">
          {t('ui.intent.train')}
        </SoonButton>
      </div>
    </Panel>
  );
}

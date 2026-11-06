import { getTranslations } from 'next-intl/server';
import { KPI_SAMPLE, TREND_SAMPLE } from '../../lib/reports-sample';
import { Icon } from '../ui/icon';
import { Badge, Panel, SoonButton } from '../ui/tw-parts';

const BAR_W = 26;
const BAR_STEP = 44;
const BASELINE = 180;

/** Biểu đồ cột xếp chồng "Xu hướng xử lý theo ngày" (§3 của reports.html). Chưa có nguồn theo ngày → `[MẪU]` ở dev. */
export async function TrendCard({ sample }: { sample: boolean }) {
  const t = await getTranslations('reports');
  const legend = [
    { key: 'ai', box: 'bg-primary-container' },
    { key: 'review', box: 'bg-secondary-container' },
    { key: 'skip', box: 'bg-surface-dim' },
  ] as const;
  return (
    <Panel size="lg" className="flex flex-col justify-between space-y-space-md lg:col-span-7">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-title-md text-title-md font-semibold text-on-surface">
              {t('ui.trend.title')}
            </h2>
            <Badge tone="neutral">{t('ui.trend.range')}</Badge>
            {sample ? <Badge tone="neutral">{t('ui.sampleTag')}</Badge> : null}
          </div>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            {t('ui.trend.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {legend.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm ${item.box}`} />
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {t(`ui.trend.legend.${item.key}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="w-full pt-4">
        {sample ? (
          <svg
            className="h-56 w-full"
            fill="none"
            preserveAspectRatio="none"
            viewBox="0 0 700 220"
            role="img"
            aria-label={t('ui.trend.chartLabel')}
          >
            {[20, 70, 120, 170].map((y, i) => (
              <g key={y}>
                <line
                  className="text-surface-container-high"
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                  x1="40"
                  x2="680"
                  y1={y}
                  y2={y}
                />
                <text
                  className="fill-current text-on-surface-variant"
                  fontSize="10"
                  textAnchor="end"
                  x="30"
                  y={y + 4}
                >
                  {240 - i * 60}
                </text>
              </g>
            ))}
            {TREND_SAMPLE.map((bucket, i) => {
              const x = 52 + i * BAR_STEP;
              const skipTop = BASELINE - bucket.skipped;
              const reviewTop = skipTop - bucket.reviewed;
              const aiTop = reviewTop - bucket.ai;
              return (
                <g key={x}>
                  <rect
                    className="fill-current text-surface-dim"
                    height={bucket.skipped}
                    rx="2"
                    width={BAR_W}
                    x={x}
                    y={skipTop}
                  />
                  <rect
                    className="fill-current text-secondary-container"
                    height={bucket.reviewed}
                    rx="2"
                    width={BAR_W}
                    x={x}
                    y={reviewTop}
                  />
                  <rect
                    className="fill-current text-primary-container"
                    height={bucket.ai}
                    rx="2"
                    width={BAR_W}
                    x={x}
                    y={aiTop}
                  />
                  {bucket.label ? (
                    <text
                      className={
                        i === TREND_SAMPLE.length - 1
                          ? 'fill-current font-semibold text-primary'
                          : 'fill-current text-on-surface-variant'
                      }
                      fontSize="10"
                      textAnchor="middle"
                      x={x + 13}
                      y="202"
                    >
                      {i === TREND_SAMPLE.length - 1
                        ? t('ui.trend.today', { date: bucket.label })
                        : bucket.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="flex h-56 items-center justify-center rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">
            {t('ui.trend.empty')}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm">
        <div className="flex items-center gap-2">
          <span className="text-primary">
            <Icon name="verified" size={14} />
          </span>
          <span className="font-body-sm text-body-sm text-on-surface">
            {t('ui.trend.note', { pct: sample ? KPI_SAMPLE.trendNote : '—' })}
          </span>
        </div>
        <SoonButton variant="link" soon={t('ui.soon')}>
          {t('ui.trend.shifts')}
        </SoonButton>
      </div>
    </Panel>
  );
}

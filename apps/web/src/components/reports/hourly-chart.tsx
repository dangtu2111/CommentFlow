import { getTranslations } from 'next-intl/server';
import { hourBars } from '../../lib/report-view';

/**
 * Biểu đồ cột số bình luận theo giờ trong ngày (Tailwind thuần, không thư viện). Cột cao nhất = 100%; giờ cao điểm
 * tô đậm. Có tiêu đề `title` từng cột (số liệu thật theo từng giờ).
 */
export async function HourlyChart({
  distribution,
  peakHours,
}: {
  distribution: number[];
  peakHours: number[];
}) {
  const t = await getTranslations('reports');
  const bars = hourBars(distribution, peakHours);
  return (
    <figure>
      <div
        className="flex h-40 items-end gap-1 rounded-lg bg-surface-container-low p-space-sm"
        role="img"
        aria-label={t('hourly.chartLabel')}
      >
        {bars.map((bar) => (
          <span
            key={bar.hour}
            className={
              bar.peak
                ? 'min-w-0 flex-1 rounded-t bg-primary-container'
                : 'min-w-0 flex-1 rounded-t bg-surface-dim'
            }
            style={{ height: `${Math.max(bar.pct, bar.count > 0 ? 4 : 0)}%` }}
            title={t('hourly.barTitle', { hour: bar.hour, count: bar.count })}
          />
        ))}
      </div>
      <div
        className="mt-1 flex justify-between font-label-sm text-label-sm text-on-surface-variant"
        aria-hidden="true"
      >
        {[0, 6, 12, 18, 23].map((hour) => (
          <span key={hour}>{t('hourly.axisHour', { hour })}</span>
        ))}
      </div>
    </figure>
  );
}

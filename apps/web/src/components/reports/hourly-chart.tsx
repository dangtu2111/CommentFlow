import { getTranslations } from 'next-intl/server';
import { hourBars } from '../../lib/report-view';

/**
 * Biểu đồ cột số bình luận theo giờ trong ngày (thuần CSS, không thư viện). Cột cao nhất = 100%; giờ cao điểm
 * tô đậm. Có bảng chữ ẩn cho trình đọc màn hình (số liệu thật theo từng giờ).
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
    <figure className="hourly-chart">
      <div className="hourly-bars" role="img" aria-label={t('hourly.chartLabel')}>
        {bars.map((bar) => (
          <span
            key={bar.hour}
            className={bar.peak ? 'hourly-bar is-peak' : 'hourly-bar'}
            style={{ height: `${Math.max(bar.pct, bar.count > 0 ? 4 : 0)}%` }}
            title={t('hourly.barTitle', { hour: bar.hour, count: bar.count })}
          />
        ))}
      </div>
      <div className="hourly-axis" aria-hidden="true">
        {[0, 6, 12, 18, 23].map((hour) => (
          <span key={hour}>{t('hourly.axisHour', { hour })}</span>
        ))}
      </div>
    </figure>
  );
}

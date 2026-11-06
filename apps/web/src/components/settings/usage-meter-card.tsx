import { getTranslations } from 'next-intl/server';
import type { UsageMeterView } from '../../lib/usage-meter-view';

const BANNER_CLASS = { ok: null, warning: 'banner-warning', blocked: 'banner-danger' } as const;

/**
 * Đồng hồ lượt AI trong tháng (FR-090, BR-06): thanh tiến độ + cảnh báo từ 80% + đề xuất mua thêm/nâng gói khi hết.
 * Chỉ trình bày số đã tính ở `buildUsageMeterView`; nút mua thêm/nâng gói chờ `TRIAL-UPGRADE-UI` nên chỉ có chữ hướng dẫn.
 */
export async function UsageMeterCard({ view }: { view: UsageMeterView }) {
  const t = await getTranslations('settings.usage');
  const bannerClass = BANNER_CLASS[view.level];
  return (
    <section className="card stack" aria-labelledby="usage-title">
      <h2 id="usage-title" className="section-title">
        {t('title')}
      </h2>
      <p className="muted">{t('body')}</p>
      <progress
        className="usage-meter"
        data-level={view.level}
        value={view.percent}
        max={100}
        aria-label={t('title')}
      />
      <p>{t('summary', { used: view.used, capacity: view.capacity, remaining: view.remaining })}</p>
      {bannerClass ? (
        <div
          className={`banner ${bannerClass}`}
          role={view.level === 'blocked' ? 'alert' : 'status'}
        >
          <div>
            <strong>{t(`${view.level}.title`)}</strong>
            <p>{t(`${view.level}.body`, { percent: view.percent })}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

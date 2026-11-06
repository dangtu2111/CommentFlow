import { getTranslations } from 'next-intl/server';
import type { UsageMeterView } from '../../lib/usage-meter-view';

/**
 * Thẻ "Hạn mức AI" ở đáy thanh bên (design/stitch/comments.png): thanh tiến độ + "đã dùng / hạn mức". Chỉ trình bày số
 * đã tính ở `buildUsageMeterView` (FR-090); nút "Nâng gói" chờ trang gói cước nên chưa hiện (không để liên kết chết).
 */
export async function ShellQuotaCard({ view }: { view: UsageMeterView }) {
  const t = await getTranslations('shell.quota');
  return (
    <section className="shell-quota" aria-label={t('title')}>
      <p className="shell-quota-head">
        <strong>{t('title')}</strong>
        <span>{view.percent}%</span>
      </p>
      <progress
        className="usage-meter"
        data-level={view.level}
        value={view.percent}
        max={100}
        aria-label={t('title')}
      />
      <p className="shell-quota-foot">
        {t('summary', { used: view.used, capacity: view.capacity })}
      </p>
    </section>
  );
}

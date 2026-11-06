import type { ReadinessResult } from '@flow/ai';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * Thanh Độ sẵn sàng AI gọn cho wizard (FR-146). Chỉ hiển thị kết quả `computeReadiness` đã có, không tính lại;
 * chi tiết từng mục ở trang /app/readiness.
 */
export async function SetupReadinessBar({ result }: { result: ReadinessResult | null }) {
  const t = await getTranslations('readiness');
  if (!result) {
    return (
      <section className="card stack" role="alert">
        <p className="muted">{t('error.body')}</p>
      </section>
    );
  }
  return (
    <section className="card stack" aria-labelledby="setup-readiness-title">
      <h2 id="setup-readiness-title" className="section-title">
        {t('title')}
      </h2>
      <progress
        value={result.score}
        max={100}
        aria-label={t('meterLabel', { score: result.score })}
      >
        {result.score}%
      </progress>
      <p>
        <strong>{result.score}%</strong>{' '}
        <span className={result.ready ? 'badge badge-on' : 'badge badge-off'}>
          {result.ready ? t('statusReady') : t('statusNotReady', { min: result.minPercent })}
        </span>
      </p>
      <p className="muted">
        {t('requiredTitle', { done: result.requiredDone, total: result.requiredTotal })}
      </p>
      <Link href="/app/readiness" className="btn btn-secondary">
        {t('details')}
      </Link>
    </section>
  );
}

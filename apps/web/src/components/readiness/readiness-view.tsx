import { READINESS_REQUIRED_ITEMS, type ReadinessResult } from '@flow/ai';
import { getTranslations } from 'next-intl/server';

/**
 * Thanh Độ sẵn sàng + mục bắt buộc + câu mẫu + gợi ý còn thiếu (FR-146, US-107). Server Component thuần hiển thị:
 * mọi số đã do `computeReadiness` tính, ở đây không tính lại.
 */
export async function ReadinessView({ result }: { result: ReadinessResult }) {
  const t = await getTranslations('readiness');
  const params = { min: result.minPercent };

  return (
    <div className="stack">
      <section className="card stack">
        <p className="muted">{t('scoreLabel')}</p>
        <progress
          value={result.score}
          max={100}
          aria-label={t('meterLabel', { score: result.score })}
        >
          {result.score}%
        </progress>
        <p>
          <strong>{result.score}%</strong>
        </p>
        <p className={result.ready ? 'badge badge-on' : 'badge badge-off'}>
          {result.ready ? t('statusReady') : t('statusNotReady', params)}
        </p>
      </section>

      <section className="card stack">
        <h2>{t('requiredTitle', { done: result.requiredDone, total: result.requiredTotal })}</h2>
        <ul className="stack">
          {READINESS_REQUIRED_ITEMS.map((item) => {
            const missing = result.missingRequired.includes(item);
            return (
              <li key={item}>
                <strong>{t(`required.${item}.label`)}</strong>{' '}
                <span className={missing ? 'badge badge-off' : 'badge badge-on'}>
                  {missing ? t('requiredMissing') : t('requiredDone')}
                </span>
                {missing ? <p className="muted">{t(`required.${item}.hint`)}</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack">
        <h2>
          {t('samplesTitle', {
            passed: result.samplePassed,
            total: result.sampleTotal,
            rate: result.samplePassRate,
          })}
        </h2>
        <ul className="stack">
          {result.samples.map((s) => (
            <li key={s.id}>
              {t(`sample.${s.id}`)}{' '}
              <span className={s.answerable ? 'badge badge-on' : 'badge badge-off'}>
                {s.answerable ? t('answerable') : t('unanswerable')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>{t('missingTitle')}</h2>
        {result.missingTopics.length === 0 ? (
          <p className="muted">{t('missingNone')}</p>
        ) : (
          <ul className="stack">
            {result.missingTopics.map((topic) => (
              <li key={topic}>{t(`missing.${topic}`)}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

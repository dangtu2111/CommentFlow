import type { TestCaseResult, TestSetSummary } from '@flow/ai';
import { useTranslations } from 'next-intl';

/** Kết quả bộ câu kiểm thử: tóm tắt + cổng đạt/chưa đạt + từng câu (mong đợi vs thực tế). */
export function KbTestSetResultView({
  results,
  summary,
}: {
  results: readonly TestCaseResult[];
  summary: TestSetSummary;
}) {
  const t = useTranslations('kbTestset');
  return (
    <section className="stack" aria-label={t('summary', summary)}>
      <p className="section-title">{t('summary', summary)}</p>
      <p role="status">{t(`gate.${summary.gate}`)}</p>
      <ul className="stack">
        {results.map((r) => (
          <li key={r.index} className="card stack">
            <p>
              <strong>{t('result.line', { n: r.index + 1 })}</strong> — {t(`result.${r.status}`)}
            </p>
            <p>{r.question}</p>
            <p className="muted">
              {t('result.expected')}: {t(`actions.${r.expected}`)}
              {r.actual ? ` · ${t('result.actual')}: ${t(`actions.${r.actual}`)}` : ''}
            </p>
            {r.failures.map((f) => (
              <p key={f} role="alert">
                {t(`failures.${f}`)}
              </p>
            ))}
            {r.missing.length > 0 ? (
              <p className="muted">{t('result.missing', { words: r.missing.join(', ') })}</p>
            ) : null}
            {r.reply ? (
              <p className="muted">
                {t('result.reply')}: {r.reply}
              </p>
            ) : null}
            {r.error ? <p className="muted">{t('result.errorName', { name: r.error })}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

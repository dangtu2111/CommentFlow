'use client';

import type { TryResult } from '@flow/ai';
import { useTranslations } from 'next-intl';

/** Kết quả một lần thử (FR-059, US-034): nhãn, câu trả lời, nguồn kèm điểm, "có được tự gửi không, vì sao". */
export function TryAiResultView({ result }: { result: TryResult }) {
  const t = useTranslations('tryAi');

  if (result.status !== 'done') {
    return (
      <section className="card stack" aria-live="polite">
        <p>{t('skipped')}</p>
        <p className="muted">{t('result.billed')}</p>
      </section>
    );
  }

  return (
    <section className="card stack" aria-live="polite">
      <dl className="stack">
        <div>
          <dt className="muted">{t('result.label')}</dt>
          <dd>{t(`labels.${result.label}`)}</dd>
        </div>
        <div>
          <dt className="muted">{t('result.lang')}</dt>
          <dd>{t(`langs.${result.lang}`)}</dd>
        </div>
        <div>
          <dt className="muted">{t('result.route')}</dt>
          <dd>{t(`routes.${result.route}`)}</dd>
        </div>
        <div>
          <dt className="muted">{t('result.action')}</dt>
          <dd>{t(`actions.${result.decision.action}`)}</dd>
        </div>
        <div>
          <dt className="muted">{t('result.confidence')}</dt>
          <dd>{result.confidence.confidence.toFixed(2)}</dd>
        </div>
      </dl>

      <h2 className="section-title">{t('result.reply')}</h2>
      {result.reply === '' ? <p className="muted">{t('result.noReply')}</p> : <p>{result.reply}</p>}

      <h2 className="section-title">{t('result.sources')}</h2>
      {result.candidates.length === 0 ? <p className="muted">{t('result.noSources')}</p> : null}
      <ul className="stack">
        {result.candidates.map((candidate) => (
          <li key={candidate.id}>
            <strong>{candidate.title}</strong>{' '}
            <span className="muted">
              {t('result.score', { score: candidate.score.toFixed(2) })}
              {candidate.used ? ` · ${t('result.used')}` : ''}
            </span>
            <p className="muted">{candidate.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="section-title">{t('result.autoSend')}</h2>
      {result.autoSend.allowed ? (
        <p role="status">{t('result.autoSendYes')}</p>
      ) : (
        <div role="status">
          <p>{t('result.autoSendNo')}</p>
          <ul>
            {result.autoSend.reasons.map((reason) => (
              <li key={reason}>{t(`blockReasons.${reason}`)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">{t('result.billed')}</p>
    </section>
  );
}

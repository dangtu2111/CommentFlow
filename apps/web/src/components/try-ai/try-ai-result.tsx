'use client';

import type { TryResult } from '@flow/ai';
import { useTranslations } from 'next-intl';

const CARD = 'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md';
const H2 = 'font-title-md text-title-md text-on-surface';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';

/** Kết quả một lần thử (FR-059, US-034): nhãn, câu trả lời, nguồn kèm điểm, "có được tự gửi không, vì sao" — dựng Tailwind theo `kb-sandbox.html`, chỉ dữ liệu thật. */
export function TryAiResultView({ result }: { result: TryResult }) {
  const t = useTranslations('tryAi');

  if (result.status !== 'done') {
    return (
      <section className={CARD} aria-live="polite">
        <p className="font-body-md text-body-md text-on-surface">{t('skipped')}</p>
        <p className={MUTED}>{t('result.billed')}</p>
      </section>
    );
  }

  const facts = [
    ['label', t(`labels.${result.label}`)],
    ['lang', t(`langs.${result.lang}`)],
    ['route', t(`routes.${result.route}`)],
    ['action', t(`actions.${result.decision.action}`)],
    ['confidence', result.confidence.confidence.toFixed(2)],
  ] as const;

  return (
    <section className="space-y-space-md" aria-live="polite">
      <div className={CARD}>
        <h2 className={H2}>{t('result.reply')}</h2>
        {result.reply === '' ? (
          <p className={MUTED}>{t('result.noReply')}</p>
        ) : (
          <p className="p-space-md rounded-xl bg-primary-fixed text-on-primary-fixed font-body-md text-body-md">
            {result.reply}
          </p>
        )}
      </div>
      <div className={CARD}>
        <h2 className={H2}>{t('result.autoSend')}</h2>
        {result.autoSend.allowed ? (
          <p
            role="status"
            className="px-3 py-2 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-title-sm text-title-sm"
          >
            {t('result.autoSendYes')}
          </p>
        ) : (
          <div
            role="status"
            className="px-3 py-2 rounded-lg bg-error-container text-on-error-container font-body-md text-body-md"
          >
            <p className="font-title-sm text-title-sm">{t('result.autoSendNo')}</p>
            <ul className="list-disc pl-5">
              {result.autoSend.reasons.map((reason) => (
                <li key={reason}>{t(`blockReasons.${reason}`)}</li>
              ))}
            </ul>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-space-md">
          {facts.map(([key, value]) => (
            <div key={key}>
              <dt className={MUTED}>{t(`result.${key}`)}</dt>
              <dd className="font-title-sm text-title-sm text-on-surface">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={CARD}>
        <h2 className={H2}>{t('result.sources')}</h2>
        {result.candidates.length === 0 ? <p className={MUTED}>{t('result.noSources')}</p> : null}
        <ul className="space-y-space-md">
          {result.candidates.map((candidate) => (
            <li key={candidate.id} className="p-space-md rounded-lg bg-surface-container-low">
              <strong className="font-title-sm text-title-sm text-on-surface">
                {candidate.title}
              </strong>{' '}
              <span className={MUTED}>
                {t('result.score', { score: candidate.score.toFixed(2) })}
                {candidate.used ? ` · ${t('result.used')}` : ''}
              </span>
              <p className={MUTED}>{candidate.text}</p>
            </li>
          ))}
        </ul>
        <p className={MUTED}>{t('result.billed')}</p>
      </div>
    </section>
  );
}

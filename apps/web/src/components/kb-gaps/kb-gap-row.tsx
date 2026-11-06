'use client';

import type { KbGapStatus } from '@flow/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type KbGapRowState, kbGapAction } from '../../app/app/(guarded)/kb-gaps/actions';

export type KbGapRowData = {
  id: string;
  sampleQuestionMasked: string;
  count: number;
  lastSeenAt: string;
  status: KbGapStatus;
};

const IDLE: KbGapRowState = { status: 'idle' };

/** Một câu hỏi chưa trả lời được: số lần hỏi, câu ví dụ (đã che PII) và ô bổ sung nhanh (UF-11). */
export function KbGapRow({ gap }: { gap: KbGapRowData }) {
  const t = useTranslations('kbGaps');
  const locale = useLocale();
  const [state, action, pending] = useActionState(kbGapAction, IDLE);
  const defaultLang = locale === 'en' ? 'en' : 'vi';
  const id = `gap-${gap.id}`;

  return (
    <li className="card stack">
      <p>
        <strong>{gap.sampleQuestionMasked}</strong>
      </p>
      <p className="muted">
        {t('seen', { count: gap.count, date: new Date(gap.lastSeenAt).toLocaleDateString(locale) })}{' '}
        <span className={gap.status === 'open' ? 'badge badge-off' : 'badge badge-on'}>
          {t(`status.${gap.status}`)}
        </span>
      </p>
      {state.status === 'error' ? <p role="alert">{t(`error.${state.code}`)}</p> : null}
      {gap.status === 'open' ? (
        <form action={action} className="stack">
          <input type="hidden" name="gapId" value={gap.id} />
          <label htmlFor={`${id}-q`}>{t('questionLabel')}</label>
          <input
            id={`${id}-q`}
            name="question"
            className="input"
            maxLength={1000}
            defaultValue={gap.sampleQuestionMasked}
          />
          <label htmlFor={`${id}-a`}>{t('answerLabel')}</label>
          <textarea id={`${id}-a`} name="answer" className="input" rows={3} maxLength={8000} />
          <label htmlFor={`${id}-l`}>{t('langLabel')}</label>
          <select id={`${id}-l`} name="lang" className="input" defaultValue={defaultLang}>
            <option value="vi">{t('lang.vi')}</option>
            <option value="en">{t('lang.en')}</option>
            <option value="all">{t('lang.all')}</option>
          </select>
          <div className="row">
            <button
              type="submit"
              name="intent"
              value="resolve"
              className="btn btn-primary"
              disabled={pending}
            >
              {t('add')}
            </button>
            <button
              type="submit"
              name="intent"
              value="ignore"
              className="btn"
              disabled={pending}
              formNoValidate
            >
              {t('ignore')}
            </button>
          </div>
        </form>
      ) : (
        <form action={action} className="row">
          <input type="hidden" name="gapId" value={gap.id} />
          <button type="submit" name="intent" value="reopen" className="btn" disabled={pending}>
            {t('reopen')}
          </button>
        </form>
      )}
    </li>
  );
}

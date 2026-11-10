'use client';

import type { KbGapStatus, KbGapTopic } from '@flow/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  type KbGapRetryState,
  type KbGapRowState,
  kbGapAction,
  retryKbGapAction,
} from '../../app/app/(guarded)/kb-gaps/actions';
import { cardLinksOfTopic } from '../../lib/kb-gaps-links';

export type KbGapRowData = {
  id: string;
  topic: KbGapTopic;
  sampleQuestionMasked: string;
  count: number;
  lastSeenAt: string;
  status: KbGapStatus;
};

const IDLE: KbGapRowState = { status: 'idle' };
const RETRY_ERRORS: Record<string, true> = {
  limit_reached: true,
  llm_missing_service: true,
  llm_missing_model: true,
  llm_flag_off: true,
  no_knowledge: true,
  ai_invalid_output: true,
  unavailable: true,
};
const RETRY_IDLE: KbGapRetryState = { status: 'idle' };

/** Một câu hỏi chưa trả lời được: số lần hỏi, câu ví dụ (đã che PII) và ô bổ sung nhanh (UF-11). */
export function KbGapRow({ gap, newCard = false }: { gap: KbGapRowData; newCard?: boolean }) {
  const t = useTranslations('kbGaps');
  const locale = useLocale();
  const [state, action, pending] = useActionState(kbGapAction, IDLE);
  const [retry, retryAction, retrying] = useActionState(retryKbGapAction, RETRY_IDLE);
  const cards = cardLinksOfTopic(gap.topic);
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
        {newCard ? <span className="badge badge-on">{t('newCard')}</span> : null}
      </p>
      {state.status === 'error' ? <p role="alert">{t(`error.${state.code}`)}</p> : null}
      {cards.length > 0 ? (
        <div className="row">
          {cards.map((link) => (
            <Link key={link.card} href={link.href} className="btn">
              {t('fillCard', { card: t(`card.${link.card}`) })}
            </Link>
          ))}
        </div>
      ) : null}
      <form action={retryAction} className="stack">
        <input type="hidden" name="gapId" value={gap.id} />
        <div className="row">
          <button type="submit" className="btn" disabled={retrying}>
            {t('retry')}
          </button>
        </div>
        {retry.status === 'done' && retry.ok ? (
          <p role="status" className="muted">
            {t('retryResult', { action: t(`retryAction.${retry.action}`) })}{' '}
            {retry.reply === '' ? t('retryNoReply') : <q>{retry.reply}</q>}
            {retry.needsHuman ? ` ${t('retryNeedsHuman')}` : ''}
          </p>
        ) : null}
        {retry.status === 'done' && !retry.ok ? (
          <p role="alert">
            {retry.reason === 'throttled'
              ? t('retryThrottled', { seconds: retry.retryAfterSec ?? 60 })
              : t(`retryError.${retry.reason in RETRY_ERRORS ? retry.reason : 'unavailable'}`)}
          </p>
        ) : null}
      </form>
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
